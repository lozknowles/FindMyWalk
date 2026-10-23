import importlib.util
import unittest
from pathlib import Path

SOURCE=Path(__file__).resolve().parents[2]/'scripts'/'import-overture-places.py'
spec=importlib.util.spec_from_file_location('overture_import',SOURCE)
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class OvertureImporterTests(unittest.TestCase):
    def feature(self, uid, name, category, confidence=.9, status='open'):
        return {'id':uid,'geometry':{'coordinates':[-.75,53.14]},'properties':{
            'names':{'primary':name},'taxonomy':{'primary':category},
            'confidence':confidence,'operating_status':status,
            'addresses':[{'freeform':'High Street'}],'phones':['+44 1234'],
            'sources':[{'property':'','update_time':'2026-10-21T00:00:00Z'}]}}

    def test_generic_category_and_confidence_filter(self):
        ids=['c270bef3-46c9-427d-864f-0ccdc91a34fd','dcca3bd4-6d44-497b-a9c4-c1658a8d7a19',
             '92f0e495-236c-42b1-9427-2b3d81403bd3','b0616524-d057-40aa-b60a-6bf79afed322']
        rows=list(module.venue_rows([
            self.feature(ids[0],'Unspecified cafe','coffee_shop'),
            self.feature(ids[1],'Low confidence cafe','cafe',.3),
            self.feature(ids[2],'Closed cafe','cafe',.9,'permanently_closed'),
            self.feature(ids[3],'Mapped pub','pub'),
        ]))
        self.assertEqual([r[1] for r in rows],['Unspecified cafe','Mapped pub'])
        self.assertEqual([r[2] for r in rows],['cafe','pub'])
        self.assertEqual(rows[0][7],'High Street')
        self.assertEqual(rows[0][8],'+44 1234')
        self.assertIn('update_time',rows[0][10])

if __name__=='__main__': unittest.main()
