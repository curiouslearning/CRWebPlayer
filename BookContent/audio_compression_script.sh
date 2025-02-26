#!/bin/bash

# List of books to process to avoid processing every single book in the directory
process_books=("TallAndShortEnLv4" "IAmNotAfraidEnLv4" "ColoursOfNatureEnLv2")
skipped_books=0

# Initialize variables for tracking progress
total_books=${#process_books[@]}

# Print initial status
echo "Starting audio compression for $total_books books..."
echo "Books to process: ${process_books[*]}"
echo "----------------------------------------"

# Iterate over each directory in the current directory
for book_dir in */; do
  # Remove trailing slash from book_dir if it exists
  book_dir="${book_dir%/}"

  # Initialize a variable to check the number of books that we skipped

  # Check if current book is in process list
  if [[ ! " ${process_books[@]} " =~ " ${book_dir} " ]]; then
    # echo "Skipping compression for book: $book_dir"
    skipped_books=$((skipped_books+1))
    continue
  fi

  # Output that we're compressing this book
  echo -e "\n[ Starting compression for book: $book_dir ]\n"
  
  # Check if the 'content/audios' directory exists in the book's directory
  if [ -d "$book_dir/content/audios" ]; then
    # Set the 'audios' and 'tmp' directory paths
    audios_dir="$book_dir/content/audios"
    tmp_dir="$book_dir/content/tmp"
    
    # Create the 'tmp' directory to store the compressed files
    mkdir -p "$tmp_dir"

    # Initialize counter for number of files processed
    files_processed=0

    # Initialize counter for number of files failed to compress
    files_failed=0
    
    # Iterate over each .wav file in the 'audios' directory
    for file in "$audios_dir"/*.wav; do
      if [ -f "$file" ]; then
        # Extract the filename without the directory path
        filename=$(basename "$file")
        
        # Set the path for the compressed file in the tmp directory
        tmp_file="$tmp_dir/$filename"
        
        # Compress the .wav file and save it as a temporary file in tmp/
        ffmpeg -i "$file" -sample_fmt s16 -ar 22050 -y -f wav "$tmp_file" -loglevel error
        
        # Check if compression was successful (i.e., the temporary file exists)
        if [ -f "$tmp_file" ]; then
          # echo "Compressed: $file -> $tmp_file"
          files_processed=$((files_processed+1))
        else
          echo "Compression failed for: $file"
          files_failed=$((files_failed+1))
        fi
      fi
    done

    # Output the number of files processed and the number of files that failed to compress
    echo "-> Processed and compressed $files_processed files"
    echo "-> Failed to process $files_failed files"
    
    # Iterate over the files in the tmp directory and move them to the audios directory
    for tmp_file in "$tmp_dir"/*.wav; do
      if [ -f "$tmp_file" ]; then
        # Extract the filename from the tmp file
        filename=$(basename "$tmp_file")
        
        # Forcefully move the compressed file from tmp to audios, overwriting the original file
        mv -f "$tmp_file" "$audios_dir/$filename"
        # echo "Replaced: $audios_dir/$filename"
      fi
    done
    
    # Remove the tmp directory after all files have been moved
    rm -rf "$tmp_dir"
    echo "-> Removed temporary directory $tmp_dir"
    
    echo "-> Compressed files and replaced original files for book: $(basename "$book_dir")"
  else
    echo "ERROR: No 'content/audios' directory found in $book_dir"
  fi
done

# Output the number of books skipped
echo -e "\nSkipped compression step for $skipped_books books"