"""Descarga las imágenes de las hojas de Google (enlaces temporales) y las guarda en img/ para que no caduquen."""
import json, os, sys, time, urllib.request
fuente = json.load(open('img_fuente.json'))
ok, mal = 0, []
for ruta, url in fuente.items():
    jpg = os.path.splitext(ruta)[0] + '.jpg'
    if (os.path.exists(ruta) and os.path.getsize(ruta) > 1000) or os.path.exists(jpg):
        ok += 1; continue
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    for intento in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as r:
                tipo, datos = r.headers.get('Content-Type', ''), r.read()
            if not tipo.startswith('image/') or len(datos) < 1000:
                raise ValueError(f'no es imagen ({tipo}, {len(datos)} bytes)')
            open(ruta, 'wb').write(datos); ok += 1; break
        except Exception as e:
            err = str(e); time.sleep(2)
    else:
        mal.append(f'{ruta}: {err}')
open('img/informe.txt', 'w').write(f'{ok} de {len(fuente)} imágenes guardadas\n' + '\n'.join(mal) + '\n')
print(open('img/informe.txt').read())
