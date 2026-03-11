# Partner Content Integration Guidelines

This document explains how external partners can add new content to the CR Web Player infrastructure. The goal is to allow partners to independently develop, test, and deploy content with minimal involvement from the core team.

---

## Overview

- **Partner Branch**: A dedicated Git branch (`Partner`) is synced to an S3 bucket. All partner content lives under this branch.
- **S3 Sync**: CircleCI will automatically sync the contents of the `Partner` branch to a designated S3 bucket. There is a **15‑minute delay** between a merge and when the bucket is updated.
- **Web App Manifest**: Partners supply a `web_app_manifest.json` describing their content (including their `app_icon_url`). The container app (CR‑container APK) consumes this manifest.
- **Icons Directory**: Place all icon files in the `icons/` directory at the root of the partner branch. The `app_icon_url` should point to the S3 path once synced.

---

## Branching Strategy

1. **Create a feature branch**
   - Base it off of the `Partner` branch: `git checkout partner && git checkout -b partner/my-new-content`.
   - Work in this branch; you can commit new assets, manifest entries, etc.
2. **Add or update manifest and icons**
   - Put new icon images in `icons/` (e.g. `icons/foo.png`).
   - Create/update `web_app_manifest.json` with your content entries and set `app_icon_url` to the path where it will live on S3 (see examples below).
3. **Submit a Pull Request**
   - Open a PR from your feature branch into `Partner`.
   - Reviewers (your team or the CR team) can comment, request changes, or approve.
   - Once approved, merge the PR into `Partner`.
4. **Testing the changes**
   - After the PR is merged, CircleCI will start syncing the `Partner` branch to S3.
   - Wait ~15 minutes for the sync to complete; the new icons and manifest will be available.
   - Download/update the latest CR‑container APK (available here: [PartnerCrContainer.apk](https://partnerdev.curiouscontent.org/CrContainer/PartnerCrContainer.apk)); it fetches the manifest from the S3 bucket and will display your content.
   - Verify your content appears correctly and icons render.
5. **Further updates**
   - If you need to fix something, repeat the process: create a new branch from `Partner`, make changes, PR back into `Partner`, test after merge.

---

## Manifest and Icon Guidelines

- **Manifest location**: `web_app_manifest.json` is in a `manifest/` directory (as currently used), be sure to reference the correct path when syncing and testing. The Container APK will fetch whichever path is configured in the build.
- **Icon handling**:
  1. Place the icon file(s) in `icons/` with a descriptive filename.
  2. The manifest entry should use the S3 URL where the file will be accessible after sync. Example:
 ```json
{
  "version": "1.0",
  "web_apps": [
    {
      "appId": 123,
      "appIconUrl": "https://partnerdev.curiouscontent.org/icons/LetsFly_dev.png",
      "title": "My Partner App",
      "appUrl": "https://...",
      "language": "local name",
      "languageInEnglishName": "English name"
    }
  ]
}
```

- **URL format**: Use the canonical S3 URL (or CloudFront CDN URL if configured). Example pattern: `"https://partnerdev.curiouscontent.org/icons/<file_name>`.
- **Relative paths** do not work because the container app loads the manifest directly from S3.

---

## Content Directory Requirement

⚠️ **All partner content MUST be stored inside the `BookContent/` directory.**

## Testing in the Container App

1. Ensure your changes have been merged to the `Partner` branch.
2. Wait for the 15‑minute CircleCI synchronization.
3. Open or reinstall the [CR‑container partner APK](https://partnerdev.curiouscontent.org/CrContainer/PartnerCrContainer.apk) to pick up the latest manifest.
4. Navigate to your content and confirm: 
   - The manifest loads without errors.
   - Icons display properly (verify `app_icon_url`).
   - Content assets (HTML/audio/etc.) load from S3.
5. If you encounter issues, make a new branch to fix them and follow the PR process again.

---

## CircleCI Sync Delay

Because of the pipeline configuration, there is a **fixed 15‑minute delay** between a commit/merge on `Partner` and the actual files appearing in the S3 bucket. Please plan your testing accordingly.

> Tip: After merging your PR, you can check the CircleCI build status to ensure the sync job has completed successfully.

---

## Best Practices

- Keep branch names descriptive (`Partner/voices-update`, `Partner/new-book-xyz`).
- Test locally using S3 emulators or preview URLs if possible before submitting a PR.
- Incrementally add content; small PRs are easier to review.
- Keep icon file sizes reasonable to minimize download time.
- Use semantic versioning or timestamps in manifest entries if you expect updates that need cache busting.

---

### Manifest Schema and Validation

The manifest located at `manifest/web_app_manifest.json` must follow this structure:

```json
{
  "version": "1.0",
  "web_apps": [
    {
      "appId": 123,
      "appIconUrl": "https://...",
      "title": "My Partner App",
      "appUrl": "https://...",
      "language": "local name",
      "languageInEnglishName": "English name"
    }
  ]
}
```

- `appId` values must be **unique** across all entries. Duplicate IDs will cause the container to ignore or overwrite apps.
- All URLs are **absolute HTTPS**; relative paths are not supported.
- Keep JSON valid: no trailing commas, proper quoting, and correct types.

> ⚠️ Before merging, run a JSON linter or our validation script (see below) to catch issues early.

### Developer Responsibilities

As a partner contributor, you should:

1. Always create feature branches off `Partner` and submit PRs back to it.
2. Ensure new `appId`s don’t collide with existing ones; search the manifest or ask maintainers if unsure.
3. Use correct, absolute URLs for icons and content so the container can fetch them after the CircleCI sync.
4. Validate JSON formatting and structure locally before opening a PR.
5. Remember the 15‑minute sync window and plan tests accordingly.



---

## Comprehensive Guide to `web_app_manifest.json`

### 1. Purpose of the Manifest

The `web_app_manifest.json` controls:
* Which books/apps appear inside the container app
* App icon display
* App title
* Routing to the correct book content
* Language metadata

### 2. Manifest File Location

The manifest file is located at:
```text
manifest/web_app_manifest.json
```

### 3. Structure of a Web App Entry

Each entry inside the `web_apps` array represents one book/app.

Example entry:
```json
{
  "appId": 4,
  "appIconUrl": "https://partnerdev.curiouscontent.org/icons/book_icon.png",
  "title": "Curious Reader Sample Book",
  "appUrl": "https://partnerdev.curiouscontent.org/?book=SampleBookFolder",
  "language": "Local Language Name",
  "languageInEnglishName": "Language Name In English"
}
```

### 4. VERY IMPORTANT RULE — Book Folder Mapping (Critical)

The value passed in:
```text
?book=
```
MUST EXACTLY match the folder name of the book inside the `bookcontent/` directory.

This is the most critical rule.

Example folder structure:
```text
bookcontent/
 ├── LetsFlyEnLv2/
 ├── CicadasSongEnLv4/
 ├── ChakusCycleHindi/
```

Correct `appUrl`:
```text
https://partnerdev.curiouscontent.org/?book=LetsFlyEnLv2
```

**Critical Rules:**
* Folder name is case sensitive
* No spaces should be used
* Any mismatch will cause book loading failure
* This includes typos, additional suffixes, or incorrect casing

The book content must already exist inside:
```text
bookcontent/<BOOK_FOLDER_NAME>
```
before updating the manifest.

### 5. App Icon Guidelines

Icons are already uploaded to:
```text
https://partnerdev.curiouscontent.org/icons/
```
Partners only need to reference the full URL inside `appIconUrl`.

### 6. appId Rules

* Every app must have a unique `appId`
* Do not reuse or duplicate IDs
* Always increment from the last existing `appId`

### 7. Language Fields

Both of these fields are required:
* `language` → Local language name
* `languageInEnglishName` → English name

Example:
```json
"language": "हिन्दी",
"languageInEnglishName": "Hindi"
```

### 8. Common Mistakes Section

Checklist of mistakes:
* Incorrect `?book=` value
* Book folder not uploaded
* Folder name mismatch
* Duplicate `appId`
* Invalid icon URL
* JSON formatting issues

### 9. Final Pre-Commit Checklist

Partners must verify:
* [ ] Book folder exists in `bookcontent/`
* [ ] Folder name exactly matches `?book=`
* [ ] Icon URL works
* [ ] `appId` is unique
* [ ] Language fields filled
* [ ] JSON syntax valid

---

By following these steps, partners can independently manage their content while ensuring consistent deployment and easy review. Welcome aboard! 🎉
