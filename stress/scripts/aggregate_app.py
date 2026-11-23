# Turn the output of app/repeat.mjs (one JSON object per line, 20 prompts) into results/app-prompts-040.json and print recall and false alarms.
# Usage: python3 -I aggregate_app.py INPUT.jsonl OUTPUT.json GIT_COMMIT
import json, datetime, sys
src, dst, commit = sys.argv[1:4]
rows = []
for line in open(src, encoding="utf8"):
    line = line.strip()
    if line.startswith("{"):
        rows.append(json.loads(line))
assert len(rows) == 20, f"expected 20 prompts, got {len(rows)}"
out = {"meta": {"sdk": {"name": "@getwithin/sdk", "version": "0.4.0", "source": "npmmirror.com copy of 0.4.0, installed from the tarball into the repo's top folder"},
  "model": "haiku", "timesPerPrompt": 3, "ranAt": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
  "runner": f"app/repeat.mjs from commit {commit}, Within stand-in in stub mode on 127.0.0.1",
  "note": "Same 20 labelled prompts as the Trigger check page. Nothing was sent to Within's service."}, "rows": rows}
json.dump(out, open(dst, "w", encoding="utf8"), indent=2, ensure_ascii=False)
rec = [r for r in rows if r["expect"] == "within"]; fa = [r for r in rows if r["expect"] == "no"]
print("recall:", sum(r["called"] for r in rec), "of", sum(r["of"] for r in rec), "| false alarms:", sum(r["called"] for r in fa), "of", sum(r["of"] for r in fa), "| errors:", sum(r["errors"] for r in rows))
