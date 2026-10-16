"""Package only extension source and its installation instructions."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
destination = root / "checkout-rapido.zip"
files = [root / "manifest.json", root / "README.md", *sorted((root / "src").glob("*"))]
with ZipFile(destination, "w", ZIP_DEFLATED) as archive:
    for source in files:
        if source.is_file():
            archive.write(source, source.relative_to(root))
print(f"Pacote criado: {destination.name}")
