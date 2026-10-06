import subprocess, sys, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
r = subprocess.run(['npx','esbuild','src/main.js','--bundle','--format=iife','--minify','--target=es2020','--legal-comments=none','--outfile=dist/game.js'], capture_output=True, text=True)
print(r.stdout, r.stderr)
if r.returncode: sys.exit(1)
js = open('dist/game.js').read().replace('</script','<\\/script')
page = open('src/page.html').read()
out = page.replace('/*__GAME_JS__*/', js)
open('dist/index.html','w').write(out)
head = "<!doctype html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover'></head><body>"
open('dist/standalone.html','w').write(head + out + "</body></html>")
print('js bytes', len(js), 'html bytes', len(out))
