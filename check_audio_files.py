#!/usr/bin/env python3
"""
Script to extract audio file names from book content.json files
and verify if they exist in the corresponding audios folders.
"""

import json
import os
from pathlib import Path
from typing import Set, List, Dict
from collections import defaultdict


def extract_audio_paths(content_json: dict) -> Set[str]:
    """
    Extract all audio file paths from a content.json structure.
    
    Audio files can be found in:
    1. params.files[].path - main audio files
    2. params.timeStampForEachText[].wordfile[].path - word-level audio files
    
    Args:
        content_json: The parsed JSON content
        
    Returns:
        Set of audio file paths (relative to content folder)
    """
    audio_paths = set()
    
    def traverse(obj):
        """Recursively traverse the JSON to find audio paths"""
        if isinstance(obj, dict):
            # Check for "files" array with audio paths
            if "files" in obj and isinstance(obj["files"], list):
                for file_item in obj["files"]:
                    if isinstance(file_item, dict) and "path" in file_item:
                        path = file_item["path"]
                        if path.startswith("audios/"):
                            audio_paths.add(path)
            
            # Check for "wordfile" array with audio paths
            if "wordfile" in obj and isinstance(obj["wordfile"], list):
                for word_file in obj["wordfile"]:
                    if isinstance(word_file, dict) and "path" in word_file:
                        path = word_file["path"]
                        if path.startswith("audios/"):
                            audio_paths.add(path)
            
            # Check for "timeStampForEachText" array
            if "timeStampForEachText" in obj and isinstance(obj["timeStampForEachText"], list):
                for timestamp in obj["timeStampForEachText"]:
                    if isinstance(timestamp, dict) and "wordfile" in timestamp:
                        traverse(timestamp["wordfile"])
            
            # Recursively traverse all values
            for value in obj.values():
                traverse(value)
        elif isinstance(obj, list):
            for item in obj:
                traverse(item)
    
    traverse(content_json)
    return audio_paths


def check_audio_files(book_content_dir: Path) -> Dict[str, List[str]]:
    """
    Check audio files for a single book.
    
    Args:
        book_content_dir: Path to the book's content directory
        
    Returns:
        Dictionary with 'found' and 'missing' lists of audio files
    """
    content_json_path = book_content_dir / "content.json"
    audios_dir = book_content_dir / "audios"
    
    if not content_json_path.exists():
        return {"found": [], "missing": [], "error": f"content.json not found in {book_content_dir}"}
    
    if not audios_dir.exists():
        return {"found": [], "missing": [], "error": f"audios folder not found in {book_content_dir}"}
    
    try:
        with open(content_json_path, 'r', encoding='utf-8') as f:
            content = json.load(f)
    except json.JSONDecodeError as e:
        return {"found": [], "missing": [], "error": f"Failed to parse JSON: {e}"}
    except Exception as e:
        return {"found": [], "missing": [], "error": f"Error reading file: {e}"}
    
    # Extract audio paths from JSON
    audio_paths = extract_audio_paths(content)
    
    found = []
    missing = []
    
    for audio_path in audio_paths:
        # Remove "audios/" prefix to get just the filename
        audio_filename = audio_path.replace("audios/", "")
        audio_file_path = audios_dir / audio_filename
        
        if audio_file_path.exists():
            found.append(audio_path)
        else:
            missing.append(audio_path)
    
    return {"found": found, "missing": missing, "error": None}


def main():
    """Main function to check all books"""
    # Get the script directory and navigate to BookContent
    script_dir = Path(__file__).parent
    book_content_base = script_dir / "BookContent"
    
    if not book_content_base.exists():
        print(f"Error: BookContent directory not found at {book_content_base}")
        return
    
    print(f"Scanning books in: {book_content_base}\n")
    print("=" * 80)
    
    all_results = {}
    total_books = 0
    total_found = 0
    total_missing = 0
    books_with_errors = []
    
    # Iterate through all book directories
    for book_dir in sorted(book_content_base.iterdir()):
        if not book_dir.is_dir():
            continue
        
        content_dir = book_dir / "content"
        if not content_dir.exists():
            continue
        
        total_books += 1
        results = check_audio_files(content_dir)
        all_results[book_dir.name] = results
        
        if results.get("error"):
            books_with_errors.append((book_dir.name, results["error"]))
            print(f"\n❌ {book_dir.name}: {results['error']}")
        else:
            found_count = len(results["found"])
            missing_count = len(results["missing"])
            total_found += found_count
            total_missing += missing_count
            
            status = "✅" if missing_count == 0 else "⚠️"
            print(f"{status} {book_dir.name}: {found_count} found, {missing_count} missing")
            
            if missing_count > 0:
                print(f"   Missing files:")
                for missing_file in results["missing"]:
                    print(f"     - {missing_file}")
    
    # Summary
    print("\n" + "=" * 80)
    print("\nSUMMARY:")
    print(f"  Total books scanned: {total_books}")
    print(f"  Total audio files found: {total_found}")
    print(f"  Total audio files missing: {total_missing}")
    
    if books_with_errors:
        print(f"\n  Books with errors: {len(books_with_errors)}")
        for book_name, error in books_with_errors:
            print(f"    - {book_name}: {error}")
    
    # Save detailed report to file
    report_file = script_dir / "audio_check_report.json"
    with open(report_file, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)
    print(f"\n  Detailed report saved to: {report_file}")


if __name__ == "__main__":
    main()

