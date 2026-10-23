"""Run with .venv-osm/bin/python tests/backend/osm-contacts.test.py."""
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location('osm_import', Path(__file__).parents[2] / 'scripts/import-osm-pois.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Contacts(unittest.TestCase):
    def test_explicit_tags_and_fallback(self):
        self.assertEqual(module.contacts({'contact:phone': ' +44 1234 ', 'website': 'javascript:bad', 'contact:website':'https://example.org', 'contact:email':'walks@example.org'}), ('+44 1234', 'https://example.org', 'walks@example.org'))
    def test_no_inference(self):
        self.assertEqual(module.contacts({'name':'A cafe', 'url':'https://example.org'}), (None, None, None))
    def test_unsafe_and_long_contacts(self):
        for url in ('javascript:alert(1)', 'https://user:password@example.org', 'https://example.org:bad', 'https://example.org/with space', 'example.org', 'https://example.org/'+'x'*2048):
            self.assertEqual(module.contacts({'phone':'x'*101, 'website':url, 'email':'bad@example.org;evil@example.org'}), (None, None, None))
    def test_importer_passes_contacts_to_atomic_staging(self):
        class Cursor:
            def executemany(self, sql, values):
                self.sql, self.values = sql, list(values)
        cursor=Cursor()
        handler=module.Importer(cursor)
        handler.add('node', 1, {'amenity':'cafe','phone':'+44 1234'}, '{"type":"Point","coordinates":[0,53]}')
        handler.flush()
        self.assertEqual(cursor.values[0][-3:], ('+44 1234', None, None))
        self.assertIn('INSERT INTO import_pois', cursor.sql)
        self.assertIn('phone=EXCLUDED.phone', cursor.sql)
if __name__ == '__main__':
    unittest.main()
