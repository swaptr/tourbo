"""Run: cd mock && uv run python -m unittest discover -s tests (needs the app's Postgres up)."""

import unittest

from tourbo_mock import keys, store


class CacheKeys(unittest.TestCase):
    def test_random_rows_rehash(self):
        rows = store.query("select key, url from qloo_cache order by random() limit 20")
        if not rows:
            self.skipTest("database unreachable or empty")
        for key, url in rows:
            self.assertEqual(keys.key_of_url(url), key, url)

    def test_urlsearchparams_encoding(self):
        # Matches Node: new URLSearchParams([["q", "a b~*-._!@#$%^&()=+,/?:;é😀"]]).toString()
        self.assertEqual(keys.serialize([("q", "a b~*-._!@#$%^&()=+,/?:;é\U0001F600")]),
                         "q=a+b%7E*-._%21%40%23%24%25%5E%26%28%29%3D%2B%2C%2F%3F%3A%3B%C3%A9%F0%9F%98%80")

    def test_locale_order(self):
        # Node: [...].sort((a, b) => a.localeCompare(b))
        js = ["__fail", "a_1", "a-1", "a.1", "a1", "ab", "aB", "Ab", "bias.trends", "entity_ids", "feature.semantic_search", "filter_type",
              "filter-type", "filter.exclude.entities", "filter.location", "filter.location.geohash", "filter.location.query", "filter.location.radius",
              "filter.results.entities", "filter.tags", "filter.type", "output.heatmap.boundary", "query", "signal.interests.entities",
              "signal.interests.tags", "take", "Take", "types"]
        self.assertEqual(sorted(reversed(js), key=keys.locale_key), js)


if __name__ == "__main__":
    unittest.main()
