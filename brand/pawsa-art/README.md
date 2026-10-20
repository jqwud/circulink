# Pawsa artwork

The approved Pawsa illustration (an orange tabby in a salakot and a lime vest) and the poses made from it.

| Folder | What it holds |
|---|---|
| `source/pawsa-base.jpg` | The approved illustration. Everything else is built from this one image. |
| `pawsa-*.png` | Masters, 1024 x 1024, transparent, with the white sticker outline. |
| `app/pawsa-*.webp` | Light copies for the app, 640 x 640 (about 550 KB for the whole set). |
| `tools/` | The scripts that cut the character out and build each pose. |

## Poses

| File | Used for |
|---|---|
| `happy` | Default standing pose, borrow success |
| `hero` | Welcome: offering a basket of things to share (onboarding, splash) |
| `point` | Pointing at a form (verify your account) |
| `wink` | Waving with a wink (login) |
| `oops` | Worried, sweat drop (errors) |
| `sleepy` | Eyes closed, "z z z" (empty screens) |
| `cheer` | Jumping with joy, aura (celebrations, badges) |
| `head` | Round portrait badge (avatar, app icon) |

Every pose uses the same frame and scale, so swapping one for another does not make him jump.

## Rebuilding

The poses are edited from the single illustration, not redrawn. His left arm is cut out and
rotated, the face is repainted for each expression, and the props, aura and white outline are added.

```
cd brand/pawsa-art/tools
npm install
node cutout.cjs          # cuts him out of the JPG (writes char.png)
node render.cjs ..       # builds every pose into brand/pawsa-art
```

Limits of this method: only his left arm (on the left of the picture) can move, so there is
no thumbs-up and no pose with both arms up. New poses like those need new artwork.
