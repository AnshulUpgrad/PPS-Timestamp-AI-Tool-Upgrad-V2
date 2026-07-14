import importlib
import json
import sys
import unittest
from unittest import mock


with mock.patch.dict(sys.modules, {'faster_whisper': None}):
    app_module = importlib.import_module('app')


class AppIntegrationTests(unittest.TestCase):
    def setUp(self):
        app_module.app.config.update(TESTING=True)
        self.client = app_module.app.test_client()

    def test_catalog_is_valid_and_exposed_by_api(self):
        catalog = app_module.load_template_catalog()

        self.assertEqual(49, len(catalog))
        self.assertIn('Face Only', catalog)
        self.assertIn('Template No 31', catalog)
        self.assertNotIn('Type Template No 31', catalog)

        response = self.client.get('/api/templates')
        payload = response.get_json()

        self.assertEqual(200, response.status_code)
        self.assertEqual(list(catalog.keys()), payload['template_ids'])
        self.assertEqual(catalog, payload['templates'])
        self.assertEqual('openai/gpt-5.6-luna', payload['default_ai_model'])

    def test_luna_is_default_and_legacy_model_aliases_still_work(self):
        response = self.client.get('/api/config')

        self.assertEqual(200, response.status_code)
        self.assertEqual('openai/gpt-5.6-luna', response.get_json()['default_ai_model'])
        self.assertEqual('openai/gpt-5.6-luna', app_module.normalize_model_name(None))
        self.assertEqual('openai/gpt-5.6-luna', app_module.normalize_model_name('gpt-5.6-luna'))
        self.assertEqual('google/gemini-2.5-flash', app_module.normalize_model_name('gemini-2.5-flash'))

    def test_ai_pages_render_luna_and_provider_neutral_controls(self):
        for route in ('/chunking', '/keypoints'):
            response = self.client.get(route)
            html = response.get_data(as_text=True)

            self.assertEqual(200, response.status_code)
            self.assertIn('openai/gpt-5.6-luna', html)
            self.assertIn('id="openrouter-api-key-input"', html)
            self.assertIn('id="ai-model-select"', html)
            self.assertNotIn('id="gemini-model-select"', html)

    def test_keypoint_generation_uses_luna_and_canonical_template_enum(self):
        captured = {}
        model_response = {
            'heading': 'Systems Thinking',
            'subheadings': [],
            'text_content': '',
            'visuals': {
                'template_name': 'Face Only',
                'why_chosen': 'Narrative fallback',
                'graphics_required': False,
                'content': {'title': '', 'items': [], 'details': []}
            }
        }

        def fake_openrouter(**kwargs):
            captured.update(kwargs)
            return json.dumps(model_response)

        sentences = [{
            'id': 0,
            'text': 'Systems thinking connects related concepts.',
            'start': 1.2,
            'end': 4.5,
            'words': [
                {'word': ' Systems', 'start': 1.2, 'end': 1.8},
                {'word': ' thinking.', 'start': 1.9, 'end': 2.5}
            ]
        }]

        with mock.patch.object(app_module, 'call_openrouter_api', side_effect=fake_openrouter):
            response = self.client.post(
                '/api/generate-session-keypoints',
                json={'sentences': sentences},
                headers={'X-OpenRouter-Key': 'test-key'}
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual('openai/gpt-5.6-luna', captured['model_name'])
        self.assertIn('Box plate horizontal', captured['prompt'])
        self.assertEqual(
            list(app_module.load_template_catalog().keys()),
            captured['response_schema']['properties']['visuals']['properties']['template_name']['enum']
        )

    def test_chunking_uses_luna_without_network_access(self):
        captured = {}

        def fake_openrouter(**kwargs):
            captured.update(kwargs)
            return json.dumps({
                'sessions': [{
                    'title': 'Connected Concepts',
                    'summary': 'The ideas belong together.',
                    'sentence_indices': [0, 1]
                }]
            })

        sentences = [
            {'id': 0, 'text': 'The first concept establishes context.'},
            {'id': 1, 'text': 'The second concept extends it.'}
        ]

        with mock.patch.object(app_module, 'call_openrouter_api', side_effect=fake_openrouter):
            response = self.client.post(
                '/api/chunk-sessions',
                json={'sentences': sentences, 'single_batch': True},
                headers={'X-OpenRouter-Key': 'test-key'}
            )

        self.assertEqual(200, response.status_code)
        self.assertEqual('openai/gpt-5.6-luna', captured['model_name'])
        self.assertEqual([0, 1], response.get_json()['sessions'][0]['sentence_indices'])

    def test_sentence_splitting_preserves_word_timestamps(self):
        transcript = {
            'segments': [{
                'words': [
                    {'word': ' Hello', 'start': 0.2, 'end': 0.6},
                    {'word': ' world.', 'start': 0.7, 'end': 1.1},
                    {'word': ' Next', 'start': 1.4, 'end': 1.8},
                    {'word': ' idea!', 'start': 1.9, 'end': 2.4}
                ]
            }]
        }

        sentences = app_module.split_transcript_into_sentences(transcript)

        self.assertEqual(2, len(sentences))
        self.assertEqual((0.2, 1.1), (sentences[0]['start'], sentences[0]['end']))
        self.assertEqual((1.4, 2.4), (sentences[1]['start'], sentences[1]['end']))


if __name__ == '__main__':
    unittest.main()
