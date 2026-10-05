# Blog

Notes worth keeping: things I figured out, how-tos, ideas to come back to.

## Writing a post

Add a file to this folder named `YYYY-MM-DD-short-title.md` and start it with a `# Title` line. The date comes from the filename and the title from the first heading. Nothing else is required.

Files not named that way (`draft-idea.md`, this README) don't show up in the list, so an undated name is a draft.

For images, put them in `img/` and link with `![alt](img/name.png)`.

## Reading it

```bash
node blog/serve.mjs
```

Then open http://localhost:4848. The page re-reads the folder whenever you switch back to it, so you can leave it open while you write. GitHub and VS Code's markdown preview render the posts too.
