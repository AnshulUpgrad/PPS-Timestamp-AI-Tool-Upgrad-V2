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
        self.assertEqual('google/gemini-2.5-flash', response.get_json()['default_ai_model'])
        self.assertEqual('openai/gpt-5.6-luna', app_module.normalize_model_name(None))
        self.assertEqual('openai/gpt-5.6-luna', app_module.normalize_model_name('gpt-5.6-luna'))
        self.assertEqual('google/gemini-2.5-flash', app_module.normalize_model_name('gemini-2.5-flash'))

    def test_ai_pages_render_luna_and_provider_neutral_controls(self):
        for route in ('/chunking', '/keypoints'):
            response = self.client.get(route)
            html = response.get_data(as_text=True)

            self.assertEqual(200, response.status_code)
            if route == '/chunking':
                self.assertIn('google/gemini-2.5-flash', html)
            else:
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

    def test_chunking_uses_gemini_2_5_flash_without_network_access(self):
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
        self.assertEqual('google/gemini-2.5-flash', captured['model_name'])
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

    def test_sentence_splitting_caps_unpunctuated_asr_text_at_segment_boundaries(self):
        segments = []
        timestamp = 0.0
        for segment_number in range(4):
            words = []
            for word_number in range(12):
                words.append({
                    'word': f' word-{segment_number}-{word_number}',
                    'start': timestamp,
                    'end': timestamp + 0.2
                })
                timestamp += 0.25
            segments.append({'words': words})

        sentences = app_module.split_transcript_into_sentences({'segments': segments})

        self.assertEqual(2, len(sentences))
        self.assertEqual([24, 24], [len(sentence['words']) for sentence in sentences])
        self.assertEqual(list(range(len(sentences))), [sentence['id'] for sentence in sentences])

    def test_sentence_splitting_uses_long_silence_as_a_boundary_without_punctuation(self):
        transcript = {
            'segments': [{
                'words': [
                    {'word': ' First', 'start': 0.0, 'end': 0.4},
                    {'word': ' thought', 'start': 0.5, 'end': 0.9},
                    {'word': ' Second', 'start': 2.5, 'end': 2.9},
                    {'word': ' thought', 'start': 3.0, 'end': 3.4}
                ]
            }]
        }

        sentences = app_module.split_transcript_into_sentences(transcript)

        self.assertEqual(2, len(sentences))
        self.assertEqual(['First thought', 'Second thought'], [sentence['text'] for sentence in sentences])

    def test_save_chunks_persists_deleted_words(self):
        deleted_word = {
            'sentence_id': 3,
            'word_id': '3:1:1.000:1.200',
            'word': 'filler',
            'start': 1.0,
            'end': 1.2
        }

        with mock.patch('builtins.open', mock.mock_open()), \
                mock.patch.object(app_module.json, 'dump') as dump_json:
            save_response = self.client.post('/api/save-chunks/sample.mp3', json={
                'sessions': [{'title': 'Test', 'sentence_indices': [3]}],
                'deleted_words': [deleted_word]
            })

        self.assertEqual(200, save_response.status_code)
        saved_payloads = [call.args[0] for call in dump_json.call_args_list]
        self.assertTrue(any(payload.get('deleted_words') == [deleted_word] for payload in saved_payloads))


if __name__ == '__main__':
    unittest.main()
