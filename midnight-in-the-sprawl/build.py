import pathlib
# Builds two versions of the game from src/:
#   midnight-in-the-sprawl.html  page body for the claude.ai artifact (the host adds <html>/<head>)
#   index.html                   standalone page to open in any browser, next to the mp3
src = pathlib.Path('src')
js = '\n'.join((src / f).read_text() for f in ['01-core.js', '02-city.js', '03-play.js'])
wrapped = ("(function () {\n'use strict';\ntry {\n" + js +
           "\n} catch (err) {\n  console.error(err);\n  const b = document.querySelector('#start');\n"
           "  if (b) { b.disabled = true; b.textContent = \"Couldn't start 3D graphics on this device.\"; }\n}\n})();")
page = (src / 'shell.html').read_text().replace('/*__GAME_JS__*/', wrapped)
pathlib.Path('midnight-in-the-sprawl.html').write_text(page)

cut = page.index('<canvas id="c"')
head, body = page[:cut], page[cut:]
standalone = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
    '<style>body{margin:0}[hidden]{display:none!important}</style>\n'
    + head + '</head>\n<body>\n' + body + '\n</body>\n</html>\n')
pathlib.Path('index.html').write_text(standalone)
print('built', len(page), len(standalone))
