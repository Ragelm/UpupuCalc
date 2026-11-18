// UpupuCalc: портативный калькулятор гачи без установки.
// Интерфейс лежит внутри exe и показывается в собственном окне; настройки — один JSON-файл рядом с exe.
package main

import (
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"io"
	"io/fs"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

//go:embed ui
var uiFS embed.FS

const appTitle = "UpupuCalc"

type server struct {
	path      string // файл настроек
	writable  bool
	keepAlive bool // режим браузера: программа живёт, пока открыта вкладка
	mu        sync.Mutex
	conns     int32
	seen      int32
	quit      chan struct{}
	once      sync.Once
}

func (s *server) stop() { s.once.Do(func() { close(s.quit) }) }

const legacySettings = "GachaCalc.settings.json"

func settingsPath() (string, bool) {
	exe, err := os.Executable()
	if err != nil {
		return "", false
	}
	if r, err := filepath.EvalSymlinks(exe); err == nil {
		exe = r
	}
	dir := filepath.Dir(exe)
	name := strings.TrimSuffix(filepath.Base(exe), filepath.Ext(exe))
	p := filepath.Join(dir, name+".settings.json")
	// Настройки прежней версии программы (GachaCalc.exe) переименовываются под новое имя, чтобы не оставлять лишний файл.
	if _, err := os.Stat(p); os.IsNotExist(err) {
		if old := filepath.Join(dir, legacySettings); old != p {
			if _, err := os.Stat(old); err == nil {
				os.Rename(old, p)
			}
		}
	}
	// Проверяем, можно ли писать в папку с программой, не оставляя лишних файлов.
	if f, err := os.OpenFile(p, os.O_RDWR, 0); err == nil {
		f.Close()
		return p, true
	}
	probe := filepath.Join(dir, name+".settings.tmp")
	f, err := os.OpenFile(probe, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
	if err != nil {
		return p, false
	}
	f.Close()
	os.Remove(probe)
	return p, true
}

func (s *server) handleSettings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.mu.Lock()
		data, err := os.ReadFile(s.path)
		s.mu.Unlock()
		if err != nil || !json.Valid(data) {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Write(data)
	case http.MethodPut, http.MethodPost:
		if !s.writable {
			http.Error(w, "папка с программой закрыта для записи", http.StatusForbidden)
			return
		}
		data, err := io.ReadAll(io.LimitReader(r.Body, 4<<20))
		if err != nil || !json.Valid(data) {
			http.Error(w, "некорректные данные", http.StatusBadRequest)
			return
		}
		s.mu.Lock()
		tmp := s.path + ".tmp"
		err = os.WriteFile(tmp, data, 0o644)
		if err == nil {
			err = os.Rename(tmp, s.path)
		}
		if err != nil {
			os.Remove(tmp)
		}
		s.mu.Unlock()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *server) handleInfo(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(map[string]any{"path": s.path, "writable": s.writable, "keepAlive": s.keepAlive})
}

// Вкладка браузера держит это соединение открытым; когда оно закрывается, программа завершается.
func (s *server) handleAlive(w http.ResponseWriter, r *http.Request) {
	fl, ok := w.(http.Flusher)
	if !ok {
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.WriteHeader(http.StatusOK)
	fl.Flush()
	atomic.StoreInt32(&s.seen, 1)
	atomic.AddInt32(&s.conns, 1)
	tick := time.NewTicker(20 * time.Second)
	defer tick.Stop()
loop:
	for {
		select {
		case <-r.Context().Done():
			break loop
		case <-s.quit:
			break loop
		case <-tick.C:
			if _, err := io.WriteString(w, ": ok\n\n"); err != nil {
				break loop
			}
			fl.Flush()
		}
	}
	if atomic.AddInt32(&s.conns, -1) == 0 && s.keepAlive {
		time.AfterFunc(4*time.Second, func() {
			if atomic.LoadInt32(&s.conns) == 0 {
				s.stop()
			}
		})
	}
}

// Заголовок окна меняется вместе с языком интерфейса.
var setTitle func(string)

func handleTitle(w http.ResponseWriter, r *http.Request) {
	data, _ := io.ReadAll(io.LimitReader(r.Body, 256))
	if r.Method == http.MethodPost && setTitle != nil && len(data) > 0 {
		setTitle(string(data))
	}
	w.WriteHeader(http.StatusNoContent)
}

// Открыть ссылку автора в обычном браузере. Разрешены только https-адреса из короткого списка.
func handleOpen(w http.ResponseWriter, r *http.Request) {
	data, _ := io.ReadAll(io.LimitReader(r.Body, 512))
	u, err := url.Parse(strings.TrimSpace(string(data)))
	ok := err == nil && r.Method == http.MethodPost && u.Scheme == "https" && u.User == nil
	if ok {
		switch strings.ToLower(u.Hostname()) {
		case "boosty.to", "github.com", "t.me", "www.kirigiris.press", "kirigiris.press":
		default:
			ok = false
		}
	}
	if !ok {
		w.WriteHeader(http.StatusForbidden)
		return
	}
	openBrowser(u.String())
	w.WriteHeader(http.StatusNoContent)
}

func startServer(keepAlive bool) (*server, string, error) {
	p, writable := settingsPath()
	s := &server{path: p, writable: writable, keepAlive: keepAlive, quit: make(chan struct{})}
	buf := make([]byte, 12)
	rand.Read(buf)
	prefix := "/" + hex.EncodeToString(buf) + "/"
	sub, err := fs.Sub(uiFS, "ui")
	if err != nil {
		return nil, "", err
	}
	mux := http.NewServeMux()
	mux.HandleFunc(prefix+"api/settings", s.handleSettings)
	mux.HandleFunc(prefix+"api/info", s.handleInfo)
	mux.HandleFunc(prefix+"api/alive", s.handleAlive)
	mux.HandleFunc(prefix+"api/title", handleTitle)
	mux.HandleFunc(prefix+"api/open", handleOpen)
	mux.Handle(prefix, http.StripPrefix(prefix, http.FileServer(http.FS(sub))))
	addr := "127.0.0.1:0"
	if a := os.Getenv("GACHA_ADDR"); a != "" {
		addr = a
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, "", err
	}
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		mux.ServeHTTP(w, r)
	})
	go http.Serve(ln, h)
	return s, "http://" + ln.Addr().String() + prefix, nil // адрес окна
}

// Режим браузера: запасной вариант, если встроенное окно недоступно.
func runBrowser(s *server, url string) {
	openBrowser(url)
	go func() {
		time.Sleep(90 * time.Second)
		if atomic.LoadInt32(&s.seen) == 0 {
			s.stop()
		}
	}()
	<-s.quit
}

func wantBrowser() bool {
	for _, a := range os.Args[1:] {
		if a == "--browser" || a == "-browser" || a == "/browser" {
			return true
		}
	}
	exe, _ := os.Executable()
	return strings.Contains(strings.ToLower(filepath.Base(exe)), "browser")
}
