import os, io
from pathlib import Path
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

templates_dir = Path("/home/ubuntu/Warehause-TEST/templates/container-lists")
templates_dir.mkdir(parents=True, exist_ok=True)

creds = Credentials.from_authorized_user_file("/home/ubuntu/.hermes/google_token.json")
service = build("drive", "v3", credentials=creds)

files_map = {
    "Gant": "1zgUY8Z9uWrGrT5M4h3H6jBlbni-ozH-3",
    "Brooks": "1jLpDR4RD2So0l25uwZz4FnDPfiMw3jrz",
    "Schwalbe": "1B43J5DbZEX6tcqMBe6PY_QxHyHCCVk2o",
    "WE-Britax": "1ug2ruJcI-XXnV0jaaL4WyuPgbWw5K5pY",
    "Medisana": "1flJdrvh_rG8fXt-rXyPwVVqRSoqzCrbj",
    "Zwilling": "1kAvSPSAE9LC7M4PQIgAQQY_mCjl66JJJ",
    "ProHeq": "1gXYGElYKYq9n3ehrTPFfnD6D3G7bWbsF",
}

print(f"Downloading 7 template files to {templates_dir}...")

for site, file_id in files_map.items():
    try:
        # Get file metadata
        meta = service.files().get(fileId=file_id, fields="id, name, mimeType").execute()
        name = meta.get("name", f"{site}.xlsx")
        mime = meta.get("mimeType", "")
        print(f"\nProcessing {site}: name='{name}', mime='{mime}'")

        out_path = templates_dir / f"{site}.xlsx"

        if mime == "application/vnd.google-apps.spreadsheet":
            # Export as xlsx
            req = service.files().export(
                fileId=file_id,
                mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )
            data = req.execute()
            with open(out_path, "wb") as f:
                f.write(data)
            print(f" -> Exported Google Sheet to {out_path.name} ({len(data)} bytes)")
        else:
            # Download binary file
            req = service.files().get_media(fileId=file_id)
            fh = io.BytesIO()
            downloader = MediaIoBaseDownload(fh, req)
            done = False
            while not done:
                status, done = downloader.next_chunk()
            with open(out_path, "wb") as f:
                f.write(fh.getvalue())
            print(f" -> Downloaded binary XLSX to {out_path.name} ({len(fh.getvalue())} bytes)")

    except Exception as e:
        print(f"ERROR downloading {site} ({file_id}): {e}")

print("\nDone downloading templates.")
