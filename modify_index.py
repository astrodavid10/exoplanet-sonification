import os
import re
import shutil

# Define the relative file path
file_path = "node_modules/@wwtelescope/engine/src/index.js"
alt_file_path = f"../{file_path}"  # Alternate file path

# Determine the actual file path
if not os.path.isfile(file_path):
    file_path = alt_file_path

# Check if the file exists
if not os.path.isfile(file_path):
    print(f"File not found: {file_path}")
    exit(1)

# The line to search for
target_line_pattern = r"renderContext\.targetCamera\.zoom = this\.renderContext\.viewCamera\.zoom = Math"

# Read the file and process it
with open(file_path, "r") as file:
    lines = file.readlines()

# Find the line number of the target line
line_number = None
for index, line in enumerate(lines):
    if re.search(target_line_pattern, line):
        line_number = index
        break

# If the line was found, delete it
if line_number is not None:
    # Create a backup of the original file
    backup_path = f"{file_path}.bak"
    shutil.copy(file_path, backup_path)
    print(f"Backup created: {backup_path}")

    # Remove the line and save the updated file
    with open(file_path, "w") as file:
        for index, line in enumerate(lines):
            if index != line_number:  # Skip the target line
                file.write(line)

    # Remove the backup file (optional, uncomment to keep the backup)
    # os.remove(backup_path)
    print(f"Line {line_number + 1} deleted from {file_path}")
else:
    print(f"No matching line found in {file_path}")
