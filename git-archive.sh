#!/bin/bash

FILENAME=~/Nextcloud/LessSafe/izarchiv-$(jq -r .version package.json).zip
git archive -o $FILENAME HEAD
echo "Archive created: $FILENAME"