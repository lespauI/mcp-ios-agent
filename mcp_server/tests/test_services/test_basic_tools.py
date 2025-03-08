import unittest
import asyncio
from app.tools.basic_tools import echo, get_server_info, random_number

class TestBasicTools(unittest.TestCase):
    def test_echo(self):
        params = {"message": "Hello, World!"}
        result = asyncio.run(echo(params))
        self.assertEqual(result["message"], "Hello, World!")

    def test_get_server_info(self):
        result = asyncio.run(get_server_info({}))
        self.assertIn("platform", result)
        self.assertIn("python_version", result)
        self.assertIn("time", result)

    def test_random_number_default(self):
        params = {}
        result = asyncio.run(random_number(params))
        self.assertGreaterEqual(result["number"], 0)
        self.assertLessEqual(result["number"], 100)

    def test_random_number_with_range(self):
        params = {"min": 10, "max": 20}
        result = asyncio.run(random_number(params))
        self.assertGreaterEqual(result["number"], 10)
        self.assertLessEqual(result["number"], 20)

    def test_random_number_min_greater_than_max(self):
        params = {"min": 20, "max": 10}
        result = asyncio.run(random_number(params))
        self.assertGreaterEqual(result["number"], 10)
        self.assertLessEqual(result["number"], 20)

if __name__ == "__main__":
    unittest.main() 