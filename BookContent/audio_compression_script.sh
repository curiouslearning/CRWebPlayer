#!/bin/bash

# Iterate over each directory in the current directory
for book_dir in */; do
  # Remove trailing slash from book_dir if it exists
  book_dir="${book_dir%/}"
  
  # Check if the 'content/audios' directory exists in the book's directory
  if [ -d "$book_dir/content/audios" ]; then
    # Set the 'audios' and 'tmp' directory paths
    audios_dir="$book_dir/content/audios"
    tmp_dir="$book_dir/content/tmp"
    
    # Create the 'tmp' directory to store the compressed files
    mkdir -p "$tmp_dir"
    
    # Iterate over each .wav file in the 'audios' directory
    for file in "$audios_dir"/*.wav; do
      if [ -f "$file" ]; then
        # Extract the filename without the directory path
        filename=$(basename "$file")
        
        # Set the path for the compressed file in the tmp directory
        tmp_file="$tmp_dir/$filename"
        
        # Compress the .wav file and save it as a temporary file in tmp/
        ffmpeg -i "$file" -sample_fmt s16 -ar 22050 -y -f wav "$tmp_file"
        
        # Check if compression was successful (i.e., the temporary file exists)
        if [ -f "$tmp_file" ]; then
          echo "Compressed: $file -> $tmp_file"
        else
          echo "Compression failed for: $file"
        fi
      fi
    done
    
    # Iterate over the files in the tmp directory and move them to the audios directory
    for tmp_file in "$tmp_dir"/*.wav; do
      if [ -f "$tmp_file" ]; then
        # Extract the filename from the tmp file
        filename=$(basename "$tmp_file")
        
        # Forcefully move the compressed file from tmp to audios, overwriting the original file
        mv -f "$tmp_file" "$audios_dir/$filename"
        echo "Replaced: $audios_dir/$filename"
      fi
    done
    
    # Remove the tmp directory after all files have been moved
    rm -rf "$tmp_dir"
    echo "Cleaned up: Removed temporary directory $tmp_dir"
    
    echo "Compressed files and replaced original files for book: $(basename "$book_dir")"
  else
    echo "No 'content/audios' directory found in $book_dir"
  fi
done