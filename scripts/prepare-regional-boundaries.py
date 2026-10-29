"""Reproduce the pinned five-province derivative. No application/project data used."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen
SOURCE = 'https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/IDN/ADM1/geoBoundaries-IDN-ADM1_simplified.geojson'
CODES = ['ID-KB', 'ID-KT', 'ID-KS', 'ID-KI', 'ID-KU']
root = Path(__file__).resolve().parents[1] / 'public/geodata'
root.mkdir(parents=True, exist_ok=True)
raw = urlopen(SOURCE, timeout=60).read()
original = json.loads(raw)
features = []
for code in CODES:
    matches = [f for f in original['features'] if f['properties']['shapeISO'] == code]
    assert len(matches) == 1, code
    feature = matches[0]
    geometry = feature['geometry']
    assert geometry['type'] in ('Polygon', 'MultiPolygon')
    polygons = [geometry['coordinates']] if geometry['type'] == 'Polygon' else geometry['coordinates']
    assert polygons
    for polygon in polygons:
        assert polygon
        for ring in polygon:
            assert len(ring) >= 4 and ring[0] == ring[-1]
            for lon, lat in ring:
                assert 107 <= lon <= 120 and -6 <= lat <= 6
    features.append({'type': 'Feature', 'properties': {'code': code, 'sourceName': feature['properties']['shapeName']}, 'geometry': geometry})
payload = json.dumps({'type': 'FeatureCollection', 'features': features}, separators=(',', ':')).encode()
(root / 'kalimantan-provinces.json').write_bytes(payload)
license_url = 'https://opendatacommons.org/licenses/odbl/1-0/'
(root / 'ODbL-1.0.txt').write_bytes(urlopen('https://raw.githubusercontent.com/spdx/license-list-data/main/text/ODbL-1.0.txt', timeout=30).read())
metadata = {'dataset': 'IDN-ADM1-65028918', 'revision': '9469f09', 'boundaryYear': 2017, 'source': SOURCE, 'sourceSHA256': hashlib.sha256(raw).hexdigest(), 'derivedSHA256': hashlib.sha256(payload).hexdigest(), 'license': 'Open Database License 1.0', 'licenseURL': license_url, 'attribution': '© OpenStreetMap contributors. Boundaries distributed by geoBoundaries; source: OpenStreetMap / Wambacher.', 'transformation': 'Extract five provinces by shapeISO; retain source geometry unchanged; retain only code and sourceName properties. No coordinate simplification.'}
(root / 'provenance.json').write_text(json.dumps(metadata, indent=2) + '\n')
print(json.dumps({'features': len(features), 'bytes': len(payload), 'sha256': metadata['derivedSHA256']}))
