# watch_and_process.py
"""
Watch 'uploads/' for new image files and run detect_fix.py on them.
No changes required to server.js. It only writes outputs next to inputs.
Usage:
  python watch_and_process.py --uploads uploads
"""
import os, time, subprocess, argparse, sys
from pathlib import Path

def is_image(fname):
    return fname.lower().endswith(('.png','.jpg','.jpeg','.tiff','.bmp'))

def already_processed(path):
    base = str(path)
    out_img = str(path.with_name(path.stem + '_annot_fix' + path.suffix))
    out_json = str(path.with_suffix(''))  # just check annotated exists by pattern
    # consider processed if annotated file exists
    return path.with_name(path.stem + '_annot_fix' + path.suffix).exists()

def process_file(p, python_exe='python'):
    p = Path(p)
    print("Processing", p)
    try:
        # call detect_fix.py as separate process
        subprocess.run([python_exe, str(Path(__file__).with_name('detect_fix.py')), str(p)], check=True, timeout=300)
        print("Done:", p)
    except subprocess.TimeoutExpired:
        print("Timeout processing", p)
    except subprocess.CalledProcessError as e:
        print("Processing failed:", e)

def main(upload_dir, poll_interval=2):
    upload_dir = Path(upload_dir)
    if not upload_dir.exists():
        print("uploads dir not found:", upload_dir)
        sys.exit(1)
    print("Watching", upload_dir)
    seen = set()
    while True:
        try:
            for f in upload_dir.iterdir():
                if not f.is_file(): continue
                if not is_image(f.name): continue
                if f.name in seen: continue
                if already_processed(f):
                    seen.add(f.name)
                    continue
                # wait a short time to allow upload completion
                time.sleep(0.5)
                process_file(f)
                seen.add(f.name)
            time.sleep(poll_interval)
        except KeyboardInterrupt:
            print("Stopping watcher")
            break
        except Exception as e:
            print("Watcher error:", e)
            time.sleep(poll_interval)

if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument('--uploads', default='uploads', help='uploads folder to watch')
    p.add_argument('--interval', type=float, default=2.0, help='polling interval seconds')
    args = p.parse_args()
    main(args.uploads, args.interval)
