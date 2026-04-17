#!/usr/bin/env bash
# Registers the DocScan Capacitor plugin (Swift + ObjC) into the Xcode
# project without manual drag-and-drop. Copies the source files into the
# ios/App/App folder and adds them to the App target via the xcodeproj
# Ruby gem (pulled in by CocoaPods). Safe to run multiple times.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/ios-plugins/DocScan"
DEST="$ROOT/ios/App/App"
PROJECT="$ROOT/ios/App/App.xcodeproj"

if [ ! -d "$PROJECT" ]; then
  echo "ERROR: $PROJECT not found. Run 'npx cap add ios' first."
  exit 1
fi

echo "Copying Swift + ObjC plugin files into the Xcode project…"
cp "$SRC/DocScanPlugin.swift" "$DEST/DocScanPlugin.swift"
cp "$SRC/DocScanPlugin.m"     "$DEST/DocScanPlugin.m"

echo "Registering files with the Xcode project + App target…"
ruby -rxcodeproj -e '
project = Xcodeproj::Project.open(ARGV[0])
target  = project.targets.find { |t| t.name == "App" }
group   = project.main_group["App"]
if target.nil? || group.nil?
  abort("App target or group not found in project")
end
["DocScanPlugin.swift", "DocScanPlugin.m"].each do |name|
  existing = group.files.find { |f| f.path == name }
  if existing.nil?
    ref = group.new_reference(name)
    target.add_file_references([ref])
    puts "  + added #{name}"
  else
    # Make sure it is also in the compile phase of the target.
    unless target.source_build_phase.files_references.include?(existing)
      target.add_file_references([existing])
      puts "  ~ re-linked #{name} to App target"
    else
      puts "  = #{name} already registered"
    end
  end
end
project.save
' "$PROJECT"

echo "Done. Re-open Xcode (or File → Refresh) and archive again."
