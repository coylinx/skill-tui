"""Exercise the built CLI in a real Linux/macOS PTY; Python stdlib only."""
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import select
import shutil
import signal
import struct
import subprocess
import tempfile
import termios
import time

PROJECT = Path(__file__).resolve().parents[1]
ENTER_ALT = b"\x1b[?1049h"
LEAVE_ALT = b"\x1b[?1049l"


class Terminal:
    def __init__(self, preload, *args, columns=100, rows=32):
        self.master, slave = pty.openpty()
        fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", rows, columns, 0, 0))
        env = dict(os.environ, CI="false", CONTINUOUS_INTEGRATION="false", TERM="xterm-256color")
        self.child = subprocess.Popen(
            [shutil.which("node"), "--import", str(preload), "dist/index.js", *map(str, args)],
            cwd=PROJECT, stdin=slave, stdout=slave, stderr=slave, env=env,
        )
        os.close(slave)
        self.output = b""
        self.offset = 0

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()

    def close(self):
        if self.master is None:
            return
        if self.child.poll() is None:
            self.child.kill()
            self.child.wait()
        os.close(self.master)
        self.master = None

    def read(self, timeout=0.1):
        if select.select([self.master], [], [], timeout)[0]:
            try:
                data = os.read(self.master, 65536)
            except OSError as error:
                if error.errno != errno.EIO:
                    raise
                return False
            self.output += data
            return bool(data)
        return True

    def expect(self, text):
        needle = text.encode()
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            index = self.output.find(needle, self.offset)
            if index >= 0:
                self.offset = index + len(needle)
                return
            if not self.read():
                break
        raise AssertionError(f"Missing {text!r}:\n{self.output.decode(errors='replace')}")

    def send(self, text):
        # Let React install the new screen's input subscriptions after painting.
        time.sleep(0.1)
        os.write(self.master, text.encode())

    def finish(self, expected=0):
        try:
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline and self.read():
                if self.child.poll() is not None:
                    # Drain the last terminal-restoration writes.
                    while self.read(0):
                        if not select.select([self.master], [], [], 0)[0]:
                            break
                    break
            code = self.child.wait(timeout=2)
            assert code == expected, (code, self.output.decode(errors="replace"))
            assert ENTER_ALT in self.output
            assert LEAVE_ALT in self.output
            return self.output
        finally:
            self.close()


def reach_preview(terminal):
    terminal.expect("发现 2 个 Skill")
    terminal.send(" ")
    terminal.send("\r")
    terminal.expect("命名安装文件夹")
    terminal.send("\r")
    terminal.expect("选择目标 Agent")
    terminal.send(" ")
    terminal.send("\r")
    terminal.expect("导入预览")


def main():
    with tempfile.TemporaryDirectory(prefix="skill-tui-pty-") as temp:
        root = Path(temp)
        home = root / "home"
        home.mkdir()
        repo = root / "repo with spaces"
        for name in ("alpha", "beta"):
            folder = repo / "skills" / name
            folder.mkdir(parents=True)
            (folder / "SKILL.md").write_text(f"---\nname: {name}\ndescription: PTY test\n---\nnew content\n")
        subprocess.run(["git", "init", "--quiet", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "add", "."], check=True)
        subprocess.run(["git", "-C", str(repo), "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "--quiet", "-m", "fixture"], check=True)
        # Isolate os.homedir() without changing HOME or agent configuration vars.
        preload = root / "isolate.mjs"
        preload.write_text('import os from "node:os"; import { syncBuiltinESMExports } from "node:module"; os.homedir = () => ' + json.dumps(str(home)) + '; syncBuiltinESMExports();\n')
        target = home / ".claude" / "skills" / "alpha"

        with Terminal(preload, "--dry-run", repo) as terminal:
            reach_preview(terminal)
            terminal.send("\r")
            output = terminal.finish()
        assert output.rfind(b"[dry-run]") > output.rfind(LEAVE_ALT)
        assert b"INSTALL" in output
        assert not target.exists()
        print("PASS: dry-run prints after screen restoration and installs nothing")

        target.mkdir(parents=True)
        (target / "SKILL.md").write_text("original content")
        with Terminal(preload, "--overwrite", repo) as terminal:
            reach_preview(terminal)
            terminal.expect("覆盖 1 项")
            assert (target / "SKILL.md").read_text() == "original content"
            terminal.send("\r")
            terminal.expect("导入完成")
            assert "new content" in (target / "SKILL.md").read_text()
            terminal.send("b")
            terminal.expect("选择要恢复的备份")
            terminal.send("1")
            terminal.expect("已恢复")
            assert (target / "SKILL.md").read_text() == "original content"
            terminal.send("r")
            terminal.expect("输入 Skill 仓库的 Git 地址")
            terminal.send("\x1b")
            terminal.finish()
        print("PASS: overwrite, backup, restore, return home, Esc exit")

        for action in ("ctrl-c", "sigterm"):
            with Terminal(preload, columns=80, rows=24) as terminal:
                terminal.expect("输入 Skill 仓库的 Git 地址")
                if action == "ctrl-c":
                    terminal.send("\x03")
                    terminal.finish()
                else:
                    terminal.child.send_signal(signal.SIGTERM)
                    terminal.finish(expected=143)
            print(f"PASS: {action} restores an 80x24 terminal")


if __name__ == "__main__":
    main()
