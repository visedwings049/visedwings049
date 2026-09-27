# Vosk offline speech models go here

This folder isn't in git (models are large binaries) — you need to download
one yourself:

1. Grab a model from https://alphacephei.com/vosk/models — for keyword
   spotting the small English model is enough:
   `vosk-model-small-en-us-0.15.zip` (~40 MB).
2. Unzip it and re-package it as the `.tar.gz` this folder expects (or point
   the Control page's "Model URL" field at wherever you host the `.tar.gz`
   instead — it doesn't have to live here):

   ```bash
   cd web/public/models
   unzip vosk-model-small-en-us-0.15.zip
   tar czf vosk-model-small-en-us-0.15.tar.gz vosk-model-small-en-us-0.15
   ```

3. The Control page's default Model URL is
   `/models/vosk-model-small-en-us-0.15.tar.gz`, which resolves to this
   folder in both `vite dev` and the built app served by the Express server.
