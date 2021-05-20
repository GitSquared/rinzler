#!/bin/sh

if [ -d "dist" ]; then
	rm -Rf dist
fi

mkdir dist
cp -R ../dist/* dist/
