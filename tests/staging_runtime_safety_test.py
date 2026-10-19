import importlib.util
import pathlib
import tempfile
import unittest

ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('runtime',ROOT/'scripts/run-local-supabase-staging.py')
runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime)

class SafetyTests(unittest.TestCase):
    def fixture(self,root):
        target=root/'staging/supabase';target.mkdir(parents=True)
        (target/'config.toml').write_text((ROOT/'staging/supabase/config.toml').read_text())
        private=root/'staging/runtime';private.mkdir()
        file=private/'captcha-test.env'
        file.write_text('SFSTORE_CAPTCHA_TEST_ONLY=true\nNEXT_PUBLIC_CHECKOUT_TURNSTILE_SITE_KEY='+runtime.TEST_SITE+'\nSUPABASE_AUTH_CAPTCHA_SECRET='+runtime.TEST_SECRET+'\n');file.chmod(0o600)
        return target,file
    def test_linked_project_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);target,_=self.fixture(root)
            (target/'.temp').mkdir();(target/'.temp/project-ref').write_text('external-project')
            with self.assertRaisesRegex(ValueError,'Linked'):runtime.settings(root)
    def test_unsafe_file_permissions_and_non_test_values_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);_,file=self.fixture(root)
            file.chmod(0o644)
            with self.assertRaisesRegex(ValueError,'0600'):runtime.settings(root)
            file.chmod(0o600);file.write_text(file.read_text().replace('SFSTORE_CAPTCHA_TEST_ONLY=true','SFSTORE_CAPTCHA_TEST_ONLY=false'))
            with self.assertRaisesRegex(ValueError,'test keys'):runtime.settings(root)
    def test_disabling_captcha_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root=pathlib.Path(directory);target,_=self.fixture(root)
            file=target/'config.toml';file.write_text(file.read_text().replace('[auth.captcha]\nenabled = true','[auth.captcha]\nenabled = false'))
            with self.assertRaisesRegex(ValueError,'remain enabled'):runtime.settings(root)
    def test_raw_credentials_never_appear_in_diagnosis(self):
        sample='sample-private-credential-do-not-print'
        self.assertNotIn(sample,runtime.diagnosis('service_role_key='+sample))
        self.assertNotIn(sample,runtime.diagnosis('public.ecr.aws Forbidden password='+sample))

if __name__=='__main__':unittest.main()
