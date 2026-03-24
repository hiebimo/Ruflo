#!/usr/bin/env bash
# Setup script for Receipt Expense Categorizer
set -e

echo "=== Receipt Expense Categorizer Setup ==="
echo ""

# Check Python 3
if ! command -v python3 &>/dev/null; then
    echo "ERROR: Python 3 is required. Install from https://python.org"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "Python $PYTHON_VERSION found."

# Install dependencies
echo ""
echo "Installing dependencies..."
pip3 install -r "$(dirname "$0")/../config/requirements.txt"

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Get your Anthropic API key: https://console.anthropic.com/"
echo "  2. Set your key:  export ANTHROPIC_API_KEY=your-key-here"
echo ""
echo "Usage:"
echo "  # Process a folder of receipt photos:"
echo "  python3 src/receipt_categorizer.py receipts/"
echo ""
echo "  # Process a single receipt:"
echo "  python3 src/receipt_categorizer.py photo.jpg"
echo ""
echo "  # Review & correct before exporting:"
echo "  python3 src/receipt_categorizer.py receipts/ --review"
echo ""
echo "  # Save with a custom filename:"
echo "  python3 src/receipt_categorizer.py receipts/ -o 2024_taxes.csv"
echo ""
echo "Supported image formats: jpg, jpeg, png, gif, webp, bmp, tiff"
echo ""
echo "Tips for best results:"
echo "  - Take photos in good light"
echo "  - Make sure the total and vendor name are clearly visible"
echo "  - Convert iPhone HEIC photos to JPG first:"
echo "      sips -s format jpeg receipt.heic --out receipt.jpg"
