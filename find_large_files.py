import os


def find_large_files(directory, size_threshold):
    """
    Find files in the given directory that are larger than the specified size threshold.

    :param directory: Directory to search in.
    :param size_threshold: Size threshold in bytes.
    :return: List of tuples containing file paths and their sizes.
    """
    large_files = []
    for root, dirs, files in os.walk(directory):
        for file in files:
            file_path = os.path.join(root, file)
            file_size = os.path.getsize(file_path)
            if file_size > size_threshold:
                large_files.append((file_path, file_size))
    return large_files


def main():
    directory = input("Enter the directory to search: ")
    size_threshold = int(input("Enter the file size threshold in bytes: "))
    large_files = find_large_files(directory, size_threshold)
    if large_files:
        print("Large files found:")
        for file_path, file_size in large_files:
            print(f"{file_path}: {file_size} bytes")
    else:
        print("No large files found.")


if __name__ == "__main__":
    main()
