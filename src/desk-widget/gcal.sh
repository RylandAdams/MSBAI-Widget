#!/bin/zsh
# gcal.sh — thin wrapper so the widget has one path to call. See gcal.py for the commands.
exec /usr/bin/python3 "${0:A:h}/gcal.py" "$@"
