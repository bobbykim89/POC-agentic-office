# Sprite Generation Flow

## Goal

Let a signed-in user visit the `video-room` in the Phaser office, generate a custom sprite sheet from either:

- a short self-description
- or an uploaded image

Then:

- call backend `POST /agents/sprite-sheet`
- persist `users.spriteSheetUrl` from the backend response
- update frontend auth state immediately
- swap the Phaser player sprite to the custom sheet
- fall back to the default office sprite when no custom sheet exists

## Active Backend Contract

Route:

- `POST /agents/sprite-sheet`

Auth:

- requires JWT

Request:

- exactly one input mode should be used
  - `{ description }`
  - or `{ imageBase64, imageMimeType }`

Response:

```json
{
  "ok": true,
  "data": {
    "spriteSheetUrl": "https://res.cloudinary.com/...",
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "displayName": null,
      "spriteSheetUrl": "https://res.cloudinary.com/..."
    },
    "sprite": {
      "...raw ai-service sprite response..."
    }
  }
}
```

Backend behavior:

- calls AI service `/agents/sprite-sheet`
- extracts `storage_record.cloudinary.secure_url`
- updates `users.spriteSheetUrl`
- returns updated user data

## Frontend Strategy

### 1. Interaction Trigger

The Phaser `video-room` zone should open a Vue modal instead of a static dialogue.

Recommended callback:

- `onOpenSpriteStudio`

### 2. Sprite Modal

The modal should support two mutually exclusive modes:

- description mode
- image upload mode

Rules:

- do not submit both inputs together
- do not submit an empty form
- show a loading state because sprite generation may take a while

### 3. Auth State Update

After a successful backend response:

- replace the current `authStore.user` with the updated user from the response

That keeps `spriteSheetUrl` authoritative in one place.

### 4. Phaser Sprite Resolution

The player should resolve its sprite source from:

- `authStore.user?.spriteSheetUrl`

Rules:

- if `spriteSheetUrl` exists, load and use that sprite sheet
- if `spriteSheetUrl` is `null`, use the existing default office worker sheet

Use the same resolution logic in two cases:

- initial page load after auth init
- runtime update after sprite generation succeeds

### 5. Runtime Texture Swap

The current Phaser player already uses a single source sheet and slices it into:

- `front`
- `back`
- `right`
- `left` as a flipped version of `right`

So runtime update should:

1. load the new source image
2. rebuild directional textures
3. update the actor texture
4. preserve current facing direction
5. preserve fallback behavior if remote loading fails

## Important Assumptions

The generated sprite sheet must remain compatible with the current Phaser slicing logic:

- one horizontal strip
- direction order: `front`, `back`, `right`
- equal-width columns

If that layout changes, the runtime loader must change too.

## Failure Handling

If custom sprite generation succeeds but Phaser cannot load the remote image:

- keep using the default sprite
- do not leave the player without a texture

If backend generation fails:

- keep the current sprite unchanged
- show the backend error in the modal

## Implementation Notes

- backend timeout may need to be longer for sprite generation than other AI routes
- Cloudinary URLs are the only URLs that should be persisted into the user profile
- Phaser texture keys should be rebuilt carefully to avoid cache collisions
- the UI should block repeat submissions while generation is in progress

## Recommended UX

- interact with `video-room`
- choose `Describe yourself` or `Upload a photo`
- submit
- show `Generating sprite...`
- on success:
  - close modal
  - show updated character immediately
- on failure:
  - keep modal open
  - show error text
