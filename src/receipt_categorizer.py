#!/usr/bin/env python3
"""
Receipt Expense Categorizer for QuickBooks Self-Employed
========================================================
Processes receipt photos using Claude AI vision to extract vendor, date,
amount, and auto-categorize into QuickBooks Self-Employed tax categories.

Usage:
    python receipt_categorizer.py receipts/          # batch folder
    python receipt_categorizer.py photo.jpg          # single receipt
    python receipt_categorizer.py receipts/ --review # interactive review
"""

import os
import sys
import base64
import csv
import json
import argparse
from pathlib import Path
from typing import Optional

try:
    import anthropic
    from rich.console import Console
    from rich.table import Table
    from rich.progress import Progress, SpinnerColumn, TextColumn
    from rich.prompt import Prompt
    from rich.panel import Panel
except ImportError:
    print("Missing dependencies. Run: pip install anthropic rich")
    sys.exit(1)

console = Console()

# QuickBooks Self-Employed Schedule C categories
QBSE_CATEGORIES = {
    "1":  "Advertising",
    "2":  "Car and Truck",
    "3":  "Commissions and Fees",
    "4":  "Contract Labor",
    "5":  "Insurance",
    "6":  "Legal and Professional Services",
    "7":  "Meals (50% deductible)",
    "8":  "Office Supplies",
    "9":  "Rent or Lease",
    "10": "Repairs and Maintenance",
    "11": "Software and Subscriptions",
    "12": "Supplies",
    "13": "Taxes and Licenses",
    "14": "Travel",
    "15": "Utilities",
    "16": "Other Business Expenses",
    "17": "Personal (Not Deductible)",
}

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff"}

MEDIA_TYPES = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".gif":  "image/gif",
    ".webp": "image/webp",
    ".bmp":  "image/jpeg",   # Claude handles as jpeg
    ".tiff": "image/jpeg",
}


# ─────────────────────────────────────────────
# Image helpers
# ─────────────────────────────────────────────

def encode_image(image_path: Path) -> tuple[str, str]:
    """Return (base64_data, media_type) for a receipt image."""
    ext = image_path.suffix.lower()
    media_type = MEDIA_TYPES.get(ext, "image/jpeg")
    with open(image_path, "rb") as f:
        data = base64.standard_b64encode(f.read()).decode("utf-8")
    return data, media_type


def find_receipt_images(folder: Path) -> list[Path]:
    """Find all receipt images in a folder (non-recursive)."""
    images: list[Path] = []
    for ext in IMAGE_EXTENSIONS:
        images.extend(folder.glob(f"*{ext}"))
        images.extend(folder.glob(f"*{ext.upper()}"))
    return sorted(set(images))


# ─────────────────────────────────────────────
# Claude AI analysis
# ─────────────────────────────────────────────

ANALYSIS_PROMPT = """Analyze this receipt image and extract information for tax purposes.
Return ONLY a valid JSON object with these exact fields — no markdown, no extra text:

{{
  "vendor": "business name on receipt",
  "date": "MM/DD/YYYY — leave empty string if not visible",
  "total": <amount as float, e.g. 45.67 — use 0 if not visible>,
  "items": "one-line description of what was purchased",
  "category_number": "<number 1-17>",
  "category": "<category name from list>",
  "confidence": "high | medium | low",
  "notes": "any useful tax notes, e.g. 'business lunch with client', 'home office supplies'"
}}

QuickBooks Self-Employed Categories:
{categories}

Categorization rules:
- Restaurant / food bills  → "Meals (50% deductible)" if business, "Personal" if personal
- Gas station, parking, tolls → "Car and Truck"
- Hotel, flights, Uber/Lyft for business trips → "Travel"
- Pens, paper, printer ink, folders → "Office Supplies"
- Tools, materials used in your work → "Supplies"
- Phone bill, internet, electricity → "Utilities"
- Adobe, Zoom, hosting, SaaS tools → "Software and Subscriptions"
- Accountant, lawyer fees → "Legal and Professional Services"
- Personal groceries, clothing, entertainment → "Personal (Not Deductible)"
- When unsure between business and personal → "Other Business Expenses" with low confidence

Return ONLY the JSON object."""


def analyze_receipt(client: anthropic.Anthropic, image_path: Path) -> dict:
    """Send a receipt image to Claude and return parsed expense data."""
    image_data, media_type = encode_image(image_path)

    categories_list = "\n".join(f"  {k}. {v}" for k, v in QBSE_CATEGORIES.items())
    prompt = ANALYSIS_PROMPT.format(categories=categories_list)

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=512,
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": image_data,
                        },
                    },
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    raw = message.content[0].text.strip()

    # Strip markdown code fences if Claude added them
    if "```json" in raw:
        raw = raw.split("```json")[1].split("```")[0].strip()
    elif "```" in raw:
        raw = raw.split("```")[1].split("```")[0].strip()

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        data = {
            "vendor": "Unknown",
            "date": "",
            "total": 0,
            "items": "Could not read receipt",
            "category_number": "16",
            "category": "Other Business Expenses",
            "confidence": "low",
            "notes": f"Parse error — raw response: {raw[:120]}",
        }

    data["file"] = image_path.name
    data["file_path"] = str(image_path)
    return data


# ─────────────────────────────────────────────
# Display helpers
# ─────────────────────────────────────────────

CONFIDENCE_COLOR = {"high": "green", "medium": "yellow", "low": "red"}


def display_receipt(receipt: dict, index: int, total: int) -> None:
    conf = receipt.get("confidence", "low")
    conf_color = CONFIDENCE_COLOR.get(conf, "red")
    amount = float(receipt.get("total", 0) or 0)

    console.print(f"\n[bold cyan]Receipt {index}/{total}:[/] {receipt['file']}")
    console.print(f"  [bold]Vendor:[/]     {receipt.get('vendor', 'Unknown')}")
    console.print(f"  [bold]Date:[/]       {receipt.get('date') or '[dim]not found[/]'}")
    console.print(f"  [bold]Amount:[/]     [green]${amount:.2f}[/]")
    console.print(f"  [bold]Items:[/]      {receipt.get('items', '')}")
    console.print(f"  [bold]Category:[/]   [green]{receipt.get('category', 'Unknown')}[/]")
    console.print(f"  [bold]Confidence:[/] [{conf_color}]{conf}[/{conf_color}]")
    if receipt.get("notes"):
        console.print(f"  [bold]Notes:[/]      {receipt.get('notes')}")


# ─────────────────────────────────────────────
# Interactive review
# ─────────────────────────────────────────────

def interactive_review(receipts: list[dict]) -> list[dict]:
    """Let user correct any categorization, focus on low-confidence ones."""
    categories_display = "\n".join(
        f"  [cyan]{k}[/]. {v}" for k, v in QBSE_CATEGORIES.items()
    )

    console.print(Panel(
        "[bold]Review Mode[/]\nPress [bold]Enter[/] to accept each category, "
        "or type a number (1-17) to change it.\n"
        "Low-confidence receipts are flagged automatically.",
        title="Interactive Review",
        border_style="yellow",
    ))

    for i, receipt in enumerate(receipts, 1):
        display_receipt(receipt, i, len(receipts))

        needs_review = (
            receipt.get("confidence") == "low"
            or receipt.get("category") == "Personal (Not Deductible)"
        )

        if needs_review:
            console.print(f"\n[yellow]  ⚠  Flagged for review[/]")

        console.print(f"\n  Categories:\n{categories_display}\n")
        choice = Prompt.ask(
            f"  Keep [green]{receipt['category']}[/]? (Enter=accept, 1-17=change)",
            default="",
        )
        if choice.strip() and choice.strip() in QBSE_CATEGORIES:
            receipt["category"] = QBSE_CATEGORIES[choice.strip()]
            receipt["category_number"] = choice.strip()
            console.print(f"  [green]✓ Changed to: {receipt['category']}[/]")
        else:
            console.print(f"  [dim]Kept: {receipt['category']}[/]")

    return receipts


# ─────────────────────────────────────────────
# Export
# ─────────────────────────────────────────────

def export_to_csv(receipts: list[dict], output_path: Path) -> None:
    """Write a CSV file importable by QuickBooks Self-Employed."""
    fieldnames = ["Date", "Vendor", "Amount", "Category", "Description", "Notes", "Source File"]

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in receipts:
            writer.writerow({
                "Date":        r.get("date", ""),
                "Vendor":      r.get("vendor", ""),
                "Amount":      r.get("total", 0),
                "Category":    r.get("category", ""),
                "Description": r.get("items", ""),
                "Notes":       r.get("notes", ""),
                "Source File": r.get("file", ""),
            })

    console.print(f"\n[bold green]✓ Exported {len(receipts)} receipts →[/] {output_path}")


# ─────────────────────────────────────────────
# Summary
# ─────────────────────────────────────────────

def print_summary(receipts: list[dict]) -> None:
    """Print category totals table."""
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}

    for r in receipts:
        cat = r.get("category", "Unknown")
        amount = float(r.get("total", 0) or 0)
        totals[cat] = totals.get(cat, 0) + amount
        counts[cat] = counts.get(cat, 0) + 1

    table = Table(title="[bold]Expense Summary by Category[/]", show_header=True, header_style="bold")
    table.add_column("Category", style="cyan", min_width=30)
    table.add_column("Receipts", justify="right")
    table.add_column("Total", justify="right", style="green")

    business_total = 0.0
    personal_total = 0.0

    for cat, total in sorted(totals.items(), key=lambda x: x[1], reverse=True):
        count = counts[cat]
        if cat == "Personal (Not Deductible)":
            table.add_row(f"[dim]{cat}[/]", f"[dim]{count}[/]", f"[dim]${total:.2f}[/]")
            personal_total += total
        else:
            table.add_row(cat, str(count), f"${total:.2f}")
            business_total += total

    console.print("\n")
    console.print(table)
    console.print(f"\n[bold green]Total Business Expenses:  ${business_total:.2f}[/]")
    if personal_total > 0:
        console.print(f"[dim]Personal (not deductible): ${personal_total:.2f}[/]")
    console.print(f"[bold]Receipts Processed: {len(receipts)}[/]")


# ─────────────────────────────────────────────
# CLI entry point
# ─────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Receipt Expense Categorizer — QuickBooks Self-Employed",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python receipt_categorizer.py receipts/            # process a folder
  python receipt_categorizer.py photo.jpg            # single receipt
  python receipt_categorizer.py receipts/ --review   # review & correct
  python receipt_categorizer.py receipts/ -o 2024_taxes.csv
        """,
    )
    parser.add_argument("path", help="Receipt image file or folder of receipt images")
    parser.add_argument("--output", "-o", default="expenses.csv",
                        help="Output CSV filename (default: expenses.csv)")
    parser.add_argument("--review", "-r", action="store_true",
                        help="Interactive review — correct categories before export")
    parser.add_argument("--no-export", action="store_true",
                        help="Skip CSV export, just show summary")
    args = parser.parse_args()

    # Require API key
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        console.print(Panel(
            "[red]ANTHROPIC_API_KEY not set[/]\n\n"
            "1. Get your key at [link]https://console.anthropic.com/[/link]\n"
            "2. Run: [bold]export ANTHROPIC_API_KEY=your-key-here[/]",
            title="Missing API Key",
            border_style="red",
        ))
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)

    # Resolve input
    input_path = Path(args.path)
    if input_path.is_file():
        if input_path.suffix.lower() not in IMAGE_EXTENSIONS:
            console.print(f"[red]Not a supported image:[/] {input_path}")
            console.print(f"Supported: {', '.join(sorted(IMAGE_EXTENSIONS))}")
            sys.exit(1)
        images = [input_path]
    elif input_path.is_dir():
        images = find_receipt_images(input_path)
        if not images:
            console.print(f"[red]No receipt images found in:[/] {input_path}")
            console.print(f"Supported formats: {', '.join(sorted(IMAGE_EXTENSIONS))}")
            sys.exit(1)
    else:
        console.print(f"[red]Path not found:[/] {input_path}")
        sys.exit(1)

    console.print(Panel(
        f"[bold green]Receipt Expense Categorizer[/]\n"
        f"QuickBooks Self-Employed  •  Powered by Claude AI\n\n"
        f"Found [bold]{len(images)}[/] receipt image(s) to process",
        border_style="green",
    ))

    # Process receipts
    receipts: list[dict] = []
    failed: list[dict] = []

    with Progress(SpinnerColumn(), TextColumn("{task.description}"), console=console) as progress:
        task = progress.add_task(f"Analyzing receipts...", total=len(images))
        for image_path in images:
            progress.update(task, description=f"[cyan]Analyzing:[/] {image_path.name}")
            try:
                result = analyze_receipt(client, image_path)
                receipts.append(result)
            except Exception as exc:
                failed.append({"file": image_path.name, "error": str(exc)})
                console.print(f"[red]  ✗ Failed:[/] {image_path.name} — {exc}")
            progress.advance(task)

    if not receipts:
        console.print("[red]No receipts were successfully processed.[/]")
        sys.exit(1)

    status_parts = [f"[green]✓ Processed: {len(receipts)}[/]"]
    if failed:
        status_parts.append(f"[red]✗ Failed: {len(failed)}[/]")
    console.print("  " + "  |  ".join(status_parts))

    # Review or just display
    if args.review:
        receipts = interactive_review(receipts)
    else:
        for i, receipt in enumerate(receipts, 1):
            display_receipt(receipt, i, len(receipts))

    # Summary table
    print_summary(receipts)

    # Export CSV
    if not args.no_export:
        output_path = Path(args.output)
        export_to_csv(receipts, output_path)

        console.print(Panel(
            "[bold]Import into QuickBooks Self-Employed:[/]\n\n"
            "1. Open QuickBooks Self-Employed\n"
            "2. Go to [bold]Transactions → Import[/]\n"
            f"3. Upload: [bold cyan]{output_path}[/]\n"
            "4. Map columns:\n"
            "   Date → Date\n"
            "   Vendor → Description\n"
            "   Amount → Amount\n"
            "   Category → Category\n\n"
            "[dim]Tip: Review 'Personal (Not Deductible)' entries before importing[/]",
            title="Next Steps",
            border_style="cyan",
        ))


if __name__ == "__main__":
    main()
