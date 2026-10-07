import pathlib, sys
root = pathlib.Path(__file__).parent
src = root / 'src'
parts = sorted(p for p in src.glob('*.js'))
js = "(function(){'use strict';\n" + "\n".join(p.read_text() for p in parts) + "\n})();\n"
page = (src / 'page.html').read_text()
i = page.index('<div id="app">')
head, body = page[:i], page[i:]
three = (root / 'vendor' / 'three.min.js').read_text()
(root / 'dist' / 'game.js').write_text(js)
standalone = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
  '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">\n'
  + head + '</head>\n<body>\n' + body + '\n<script>' + three + '</script>\n<script>\n' + js + '</script>\n</body>\n</html>\n')
(root / 'dist' / 'vyrium.html').write_text(standalone)
artifact = head + body + '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script>\n' + js + '</script>\n'
(root / 'dist' / 'vyrium-artifact.html').write_text(artifact)
print('js bytes', len(js), 'standalone', len(standalone), 'artifact', len(artifact))
