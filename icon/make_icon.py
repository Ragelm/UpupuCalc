"""Значок UpupuCalc: золотая буква U на чёрном круге с золотой окантовкой.
Один векторный рисунок; для мелких размеров (до 32 px) линии толще, чтобы значок не расплывался."""
import os, sys
GOLD = '#f2c65c'
BLACK = '#0b0a08'

def svg(small=False, square_bg=False, size=None):
    ring, r = (22, 116) if small else (14, 119)
    u = 'M86 66V136A42 42 0 0 0 170 136V66' if small else 'M88 64V138A40 40 0 0 0 168 138V64'
    uw = 40 if small else 32
    wh = f' width="{size}" height="{size}"' if size else ''
    bg = f'<rect width="256" height="256" fill="{BLACK}"/>' if square_bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"{wh}>{bg}'
            f'<circle cx="128" cy="128" r="{r}" fill="{BLACK}" stroke="{GOLD}" stroke-width="{ring}"/>'
            f'<path d="{u}" fill="none" stroke="{GOLD}" stroke-width="{uw}"/></svg>')

if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, 'UpupuCalc-icon.svg'), 'w').write(svg())
    open(os.path.join(out, 'UpupuCalc-icon-small.svg'), 'w').write(svg(small=True))
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        pg = b.new_page(device_scale_factor=1)
        def render(name, n, **kw):
            pg.set_viewport_size({'width': n, 'height': n})
            pg.set_content('<html><body style="margin:0;background:transparent">' + svg(size=n, **kw) + '</body></html>')
            pg.screenshot(path=os.path.join(out, name), omit_background=True, clip={'x': 0, 'y': 0, 'width': n, 'height': n})
        for n in (256, 64, 48, 40, 32, 24, 20, 16):
            render(f'icon{n}.png', n, small=n <= 32)
        render('UpupuCalc-icon.png', 1024)
        render('UpupuCalc-avatar.png', 1024, square_bg=True)
        b.close()
