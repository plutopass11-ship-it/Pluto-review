import subprocess
import os

key_path = r"C:\Users\Admin\.ssh\id_github_temp"
if os.path.exists(key_path):
    os.remove(key_path)
if os.path.exists(key_path + ".pub"):
    os.remove(key_path + ".pub")

subprocess.run(["ssh-keygen", "-t", "ed25519", "-f", key_path, "-N", "", "-C", "temp-kitsu-client"], check=True)
