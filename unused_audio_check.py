#!/usr/bin/env python3
"""
Find unused audio files in each book's content directory.
- Reads BookContent/*/content/content.json
- Extracts referenced audio paths (params.files[].path and timeStampForEachText[].wordfile[].path)
- Lists files present in BookContent/*/content/audios/
- Reports files present on disk but not referenced in content.json
- Writes a detailed JSON report to unused_audio_report.json
"""

import json
import os
from pathlib import Path
from typing import Set, Dict, List


def extract_audio_paths(content_json: dict) -> Set[str]:
	"""Recursively extract all referenced audio paths from the content JSON."""
	referenced: Set[str] = set()

	def traverse(obj):
		if isinstance(obj, dict):
			# files[].path (main audio files)
			files = obj.get("files")
			if isinstance(files, list):
				for item in files:
					if isinstance(item, dict):
						path_val = item.get("path")
						if isinstance(path_val, str) and path_val.startswith("audios/"):
							referenced.add(path_val)

			# timeStampForEachText[].wordfile[].path (word-level audio files)
			ts = obj.get("timeStampForEachText")
			if isinstance(ts, list):
				for entry in ts:
					if isinstance(entry, dict):
						wordfiles = entry.get("wordfile")
						if isinstance(wordfiles, list):
							for wf in wordfiles:
								if isinstance(wf, dict):
									path_val = wf.get("path")
									if isinstance(path_val, str) and path_val.startswith("audios/"):
										referenced.add(path_val)

			for v in obj.values():
				traverse(v)
		elif isinstance(obj, list):
			for item in obj:
				traverse(item)

	traverse(content_json)
	return referenced


def find_unused_for_book(book_content_dir: Path) -> Dict[str, List[str]]:
	"""Return a dict with lists of 'unused', 'referenced', 'on_disk' plus optional 'error'."""
	content_json_path = book_content_dir / "content.json"
	audios_dir = book_content_dir / "audios"

	if not content_json_path.exists():
		return {"unused": [], "referenced": [], "on_disk": [], "error": f"content.json not found in {book_content_dir}"}

	if not audios_dir.exists():
		return {"unused": [], "referenced": [], "on_disk": [], "error": f"audios folder not found in {book_content_dir}"}

	try:
		with open(content_json_path, "r", encoding="utf-8") as f:
			content = json.load(f)
	except json.JSONDecodeError as e:
		return {"unused": [], "referenced": [], "on_disk": [], "error": f"Failed to parse JSON: {e}"}
	except Exception as e:
		return {"unused": [], "referenced": [], "on_disk": [], "error": f"Error reading file: {e}"}

	referenced_paths = extract_audio_paths(content)
	# Normalize to filenames (strip leading 'audios/')
	referenced_files = {p.split("/", 1)[1] for p in referenced_paths if "/" in p}

	# Collect all files on disk in audios dir (non-recursive)
	on_disk_files = set()
	for entry in audios_dir.iterdir():
		if entry.is_file():
			on_disk_files.add(entry.name)

	unused = sorted(list(on_disk_files - referenced_files))
	return {
		"unused": unused,
		"referenced": sorted(list(referenced_files)),
		"on_disk": sorted(list(on_disk_files)),
		"error": None,
	}


def main():
	root = Path(__file__).parent
	book_content_base = root / "BookContent"
	if not book_content_base.exists():
		print(f"Error: BookContent directory not found at {book_content_base}")
		return

	all_results: Dict[str, Dict[str, List[str]]] = {}
	total_books = 0
	total_unused = 0
	books_with_unused = 0
	books_with_errors: List[str] = []

	print(f"Scanning for UNUSED audio files in: {book_content_base}\n")
	print("=" * 80)

	for book_dir in sorted(book_content_base.iterdir()):
		if not book_dir.is_dir():
			continue
		content_dir = book_dir / "content"
		if not content_dir.exists():
			continue

		result = find_unused_for_book(content_dir)
		all_results[book_dir.name] = result
		total_books += 1

		error = result.get("error")
		if error:
			books_with_errors.append(f"{book_dir.name}: {error}")
			print(f"❌ {book_dir.name}: {error}")
			continue

		unused_count = len(result["unused"])
		if unused_count > 0:
			books_with_unused += 1
			total_unused += unused_count
			print(f"⚠️  {book_dir.name}: {unused_count} unused files")
			for filename in result["unused"][:10]:
				print(f"   - {filename}")
			if unused_count > 10:
				print(f"   ... and {unused_count - 10} more")
		else:
			print(f"✅ {book_dir.name}: no unused audio files")

	print("\n" + "=" * 80)
	print("SUMMARY:")
	print(f"  Books scanned: {total_books}")
	print(f"  Books with unused audio: {books_with_unused}")
	print(f"  Total unused files: {total_unused}")
	if books_with_errors:
		print(f"  Books with errors: {len(books_with_errors)}")
		for line in books_with_errors:
			print(f"    - {line}")

	report_path = root / "unused_audio_report.json"
	with open(report_path, "w", encoding="utf-8") as f:
		json.dump(all_results, f, indent=2, ensure_ascii=False)
	print(f"\nDetailed report written to: {report_path}")


if __name__ == "__main__":
	main()
