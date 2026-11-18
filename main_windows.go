//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"syscall"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	dwmapi   = syscall.NewLazyDLL("dwmapi.dll")
	pMsgBox  = user32.NewProc("MessageBoxW")
	pMetrics = user32.NewProc("GetSystemMetrics")
	pDpi     = user32.NewProc("GetDpiForSystem")
	pDpiCtx  = user32.NewProc("SetProcessDpiAwarenessContext")
	pDwmAttr = dwmapi.NewProc("DwmSetWindowAttribute")
)

func init() { runtime.LockOSThread() }

func msgBox(text string) {
	t, _ := syscall.UTF16PtrFromString(text)
	c, _ := syscall.UTF16PtrFromString(appTitle)
	pMsgBox.Call(0, uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(c)), 0x10)
}

func openBrowser(url string) {
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

const tmpPrefix = "upupucalc-wv-"

// Убираем папки, оставшиеся после аварийного завершения. Папку работающей копии не трогаем:
// её файл-замок открыт и не удаляется.
func cleanStale() {
	dirs, _ := filepath.Glob(filepath.Join(os.TempDir(), tmpPrefix+"*"))
	old, _ := filepath.Glob(filepath.Join(os.TempDir(), "gacha-calc-wv-*")) // папки прежней версии
	dirs = append(dirs, old...)
	for _, d := range dirs {
		lock := filepath.Join(d, "lock")
		if err := os.Remove(lock); err != nil && !os.IsNotExist(err) {
			continue
		}
		os.RemoveAll(d)
	}
}

func removeLater(dir string, lock *os.File) {
	if lock != nil {
		lock.Close()
	}
	for i := 0; i < 40; i++ {
		if err := os.RemoveAll(dir); err == nil {
			return
		}
		time.Sleep(150 * time.Millisecond)
	}
}

func scaleAndScreen() (float64, int, int) {
	scale := 1.0
	if pDpi.Find() == nil {
		if d, _, _ := pDpi.Call(); d >= 96 {
			scale = float64(d) / 96
		}
	}
	sw, _, _ := pMetrics.Call(0)
	sh, _, _ := pMetrics.Call(1)
	return scale, int(sw), int(sh)
}

func runWindow(url string) bool {
	if v, err := webviewloader.GetInstalledVersion(); err != nil || v == "" {
		return false
	}
	cleanStale()
	dir, err := os.MkdirTemp("", tmpPrefix)
	if err != nil {
		return false
	}
	lock, _ := os.Create(filepath.Join(dir, "lock"))
	os.Setenv("WEBVIEW2_DEFAULT_BACKGROUND_COLOR", "FF0B0A08")

	scale, sw, sh := scaleAndScreen()
	w, h := int(1400*scale), int(920*scale)
	if sw > 0 && w > sw-40 {
		w = sw - 40
	}
	if sh > 0 && h > sh-80 {
		h = sh - 80
	}
	wv := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:  dir,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{Title: appTitle, Width: uint(w), Height: uint(h), IconId: 1, Center: true},
	})
	if wv == nil {
		removeLater(dir, lock)
		return false
	}
	if hwnd := uintptr(wv.Window()); hwnd != 0 && pDwmAttr.Find() == nil {
		on := int32(1)
		pDwmAttr.Call(hwnd, 20, uintptr(unsafe.Pointer(&on)), 4) // тёмный заголовок окна
		pDwmAttr.Call(hwnd, 19, uintptr(unsafe.Pointer(&on)), 4) // то же для старых сборок Windows 10
	}
	mw, mh := int(1000*scale), int(620*scale)
	if mw > w {
		mw = w
	}
	if mh > h {
		mh = h
	}
	wv.SetSize(mw, mh, webview2.HintMin)
	setTitle = func(t string) { wv.Dispatch(func() { wv.SetTitle(t) }) }
	wv.Navigate(url)
	wv.Run()
	wv.Destroy()
	removeLater(dir, lock)
	return true
}

func main() {
	if pDpiCtx.Find() == nil {
		pDpiCtx.Call(^uintptr(3)) // PER_MONITOR_AWARE_V2
	}
	browser := wantBrowser()
	s, url, err := startServer(false)
	if err != nil {
		msgBox("Не удалось запустить программу: " + err.Error())
		os.Exit(1)
	}
	if !browser && runWindow(url) {
		return
	}
	s.keepAlive = true
	runBrowser(s, url)
}
