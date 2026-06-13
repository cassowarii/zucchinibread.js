# zucchinibread.js 🥒🍞

This is a distillation of some of the code I've been using to make games for the last little while. Code for loading/managing audio,
loading/displaying images, running a very simple game loop, as well as a quite general and extensible 'screen transition' system.
You could charitably call it a "game engine," but that might be giving it a little too much credit. I will probably add support for
other stuff I like later (I'd like to add sprite registration points, tilemap drawing, and bitmap font support), but I'm trying to
be conservative with what I move into the library in case I need to change behaviors later.

Sorry about the underscores.

## How do?

### setup

Create an `index.html` file to hold your game. Make sure it has a `<canvas>` element that has some ID. This is the canvas that will be used for drawing.

I recommend just dropping `zucchinibread.js` into your project folder and doing something like

```html
<script src="zucchinibread.js"></script>
<script src="game.js"></script>
```

Now make a file `game.js` where you put your game logic.

Here is how to initialize your game:

```javascript
zb.ready(() => {
    zb.create_game({
        /* Parameters to set up the game */
        canvas: 'mycanvas',           /* ID of your canvas element */
        draw_scale: 4,                /* How much the pixels should be scaled up. */
        background_color: '#000000',  /* Background color that will be drawn underneath everything you draw */

        /* Functions that are called each frame to update/draw the game */
        draw_func: do_draw,           /* Function that will be called in the game loop to render the game - receives canvas context as parameter */
        update_func: do_update,       /* Function that will be called to update the game state - receives time delta of update in ms as parameter */

        /* Game mode specific functions (these can replace draw_func and update_func) */
        modes: {
            title_screen: {
                draw: do_draw_menu,
                update: do_update_menu,
            },
            game: {
                draw: do_draw_game,
                update: do_update_game,
            },
        },
        mode: 'title_screen',         /* Mode the game should start in */

        /* Event handlers for the regular JS events */
        events: {
            mouseup: mouseup_func,
            keydown: keydown_func,
            /* etc. */
        },                            /* Callbacks for events. Receive the game object as 1st parameter, event 2nd. */

        /* Optional parameters you can add: */
        frame_rate: 60,               /* Frame rate the game will run at - optional, default 60 */
        run_in_background: true,      /* Don't auto-pause when clicking away from game (optional, default true) */
        load_with_progress_bar: true, /* Draw progress bar on the loading screen (optional, default true) */
        save_key: 'example.game.hi',  /* put this to enable saving; key where the save file will be stored in localStorage */

        /* You can also add any random extra parameters you want to store here as well.
         * These will be accessible as `game.property_name`. For example: */
        tile_size: 8,                 /* How big each 'tile' in the game is. */
        level_w: 20,                  /* Width of the game levels. */
        level_h: 14,                  /* Height of the game levels. */
    })
    .setup(() => {
        /* This will be called before loading game assets.
         * The game object is accessible here under the name 'game'. */
    });
    /* these will be explained below */
    .register_images({ ... })
    .register_music({ ... })
    .register_sfx({ ... })
    .resources_ready()
    .setup(() => {
        /* This will be called once images, music, and sound effects finish loading,
         * so you can refer to their properties here without fear.
         * The game object is accessible here under the name 'game'. */
    });
});
```

You will get some extra properties automatically calculated as well: `game.screen_w` and `game.screen_h` will hold the
actual pixel dimensions of your game screen (i.e. `game.canvas.width / game.draw_scale` and `game.canvas.height / game.draw_scale`).

Make sure you call `resources_ready()` after you register all your resources,
or the game will never finish loading. It's like a safety feature, to let the game
know you're done telling it to load new stuff.
Also, calling it before means the game will wait to call any `setup()` function until
after the game finishes loading, so you can use it in cases where you want to refer to
something like the width of an image, which isn't known until everything has loaded.

Also, there are some images to provide in the root directory: `loading.png` and `clicktostart.png`,
which will be drawn over the full screen when the game is loading and when the game has finished
loading respectively; `pause.png` (if you have `run_in_background: false`) which is drawn over the
screen when you click out of the game and it pauses; and `progressbar.png` which will be drawn partially
in the center of the screen as the game loads (not required if `load_with_progress_bar: false`).

Your game logic should go in the callback which is passed as `update_func` (or in `modes.<whatever>.update`,
and your drawing logic should live in the callback which is passed as `draw_func` (or in `modes.<whatever>.draw`).
These functions (as well as the event handler functions) receive the game object in the global scope
under the name `game`, so in these functions and the functions they call you can look at the game object that way.
In the drawing functions, you also receive various drawing methods namespaced under `draw`.

### resource loading

Here are the things the engine knows how to load, which you should call in the `zb.ready` function chained after calling
`create_game`:

#### sound effects

```javascript
.register_sfx({
    sfx1: {
        path: 'sfx/sfx1.wav',
        volume: 0.05,
    },
    sfx2: {
        path: 'sfx/sfx2.wav',
        volume: 0.05,
    },
    /* etc. */
});
```

This loads a few copies of each sound effect into an array so they can be played over each other properly.

You can play the sound effects later with `game.sfx.sfx1.play()`.

#### images

```javascript
.register_images({
    tiles: 'tile.png',
    character: 'character.png',
    objs: 'objs.png',
    enemies: {
        bean: 'enemies/bean.png',
        clock: 'enemies/clock.png',
        noodle: 'enemies/noodle.png',
    }
});
```

This will cause the game to go and find these images and load them in for you. You can
access them later at `game.img.tiles` or whatever. As you can see here, you can also provide
a more complex nested series of paths, and it will handle them correctly (in this example
the enemy image objects will be accessible at `game.img.enemies.bean`, etc.)

#### music

```javascript
.register_music({
    bgm1: {
        path: 'music/bgm1',
        volume: 0.5,
    }
    bgm2: {
        path: 'music/bgm2.wav',
        volume: 0.5,
    },
});
```

This will pull the proper music files. Note that if you do not specify a file extension, it will add either `.mp3`
or `.ogg` depending on what is supported by your browser. (if you don't want to provide both, it defaults to mp3 and
I think most browsers nowadays support mp3? Firefox didn't used to support mp3 (I think?), which is why I added this, but
nowadays I just tend to use mp3's and they work fine.) Or you can just give the file extension like a normal person.
Anyway, these are just normal javascript `audio` objects, except that they automatically pause when you click out of
the game if `run_in_background` is set to false, and they can be muted.

Also, you can mute the game's sound with `game.mute()`, unmute with `game.unmute()`, or toggle mute with `game.toggle_mute()`.

### If you please, draw me a sheep

You can draw stuff in a few different ways. The `draw` callback functions receive some special methods namespaced globally
under `draw`.

You can access a normal HTML canvas context with `draw.context`, so you can draw shapes or images with the
[normal HTML canvas drawing functions](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial),
but the library provides some convenience functions to draw images or sprites.

* `draw.image(game.img.whatever, x, y)`: Draws an image at a particular coordinate location (`x`, `y`) on the screen.
  It rounds the coordinates to the nearest whole-number pixel coordinates, as otherwise certain browsers on certain operating
  systems (naming no names) will freak out and draw the edges of the image weirdly.
* `draw.screen(game.img.whatever)`: Draws an image over the whole screen. Actually it just draws the image at (0, 0). Since this
  engine doesn't really have text support, this is usually how I handle drawing text for each level -- just make a
  big image that's the size of the screen and put text wherever you want. As a bonus, you can draw images and stuff into
  it as well! Wow so flexible!
* `draw.sprite(game.img.whatever, section_w, section_h, section_x, section_y, dest_x, dest_y)`: This one divides up the source
  image into a grid of chunks of size `section_w` x `section_h`, then takes the chunk at grid location (`section_x`, `section_y`)
  and draws it to the screen at coordinates (`dest_x`, `dest_y`). Useful for drawing tilemaps and/or sprite animations!
* `draw.buttons(button_data)`: This is related to the UI/button system, which I will write about at some point, but I kind of want
  to restructure how it works, so hmm.
* `draw.scoped(() => { ... })`: This will let you mess with the drawing context and then restore it at the end using the HTML
  canvas `save()` and `restore()` methods. In particular calls to `translate` and `rotate` should be wrapped inside this.
* `draw.translate(x, y)`: Shifts the whole drawing context over by some amount. Useful if you want to draw a bunch of stuff at
  a particular offset without worrying about adding some number to the coordinates every time.
* `draw.rotate(radians)`, `draw.rotate_deg(degrees)`: Rotates the drawing context by some amount so that the next thing you
  draw will be rotated. I think it rotates around (0, 0), so calling `translate` may help with rotating around a particular point.

### Screen transitions

I need to document these still... I have rewritten the interface finally, though.

### Buttons

We have button functionality now! I will write this up soon.

### Save load

If you specified a `save_key` when creating your game, you have save/load functionality.

If the user has third party cookies disabled in chrome, this will block saving. So you will need to provide another full-screen
image in the root folder, `saveerror.png`, which will be shown before the game starts and should warn the user about the fact that
their game will not be able to save.

You also get access to these two functions:
* `game.save(key, data)`: Saves the data `data` under the key `key`. Pretty self-explanatory. It saves using `JSON.stringify`, so
  make sure to only ... save ... stuff that can be stringified?? Sure
* `game.load(key)`: Returns the data that was previously saved under `key`, or `undefined` if nothing was saved there.

These functions silently fail if saving does not work due to having cookies disabled. I should probably add a way to tell if saving is broken... :/

### random extra utility functions

* `zb.mod(number, modulo)`: This takes the number `number` and gives you the result of `number` modulo `modulo`. It works the same
  as the normal Javascript `%` operator, except that the output is always guaranteed to be within the range [0, `modulo`), which
  isn't true of regular `%` when the first value is negative. Since the default `%` behavior is basically something I've never wanted
  ever, this is a convenience function that does the correct thing instead.
* `zb.sgn(x)`: Returns -1 if `x` &lt; 0, 0 if `x` = 0, and 1 if `x` &gt; 0.
* `zb.copy_list(list)`: Copies a list shallowly and returns a new copy of it.
* `zb.copy_flat_objlist(list)`: Copies a list of objects one level deep, i.e. it will copy each object in the list using `{ ...object }`,
  but it is not a full deep copy. Still, this type of function comes in handy especially when writing 'undo' logic.
* `zb.rand_int(x)`: Returns a random integer from 0 to `x` (not including `x`).
* `zb.rand_int(x, y)`: Returns a random integer from `x` to `y` (including `x`, but not including `y`).
* `zb.as_hex(n, length)`: Returns a string representing the number `n` in hexadecimal. If `length` is provided, it will add zeroes to
  the beginning of the string until it is `length` characters long. This can be useful when generating color values (like `#ac59d0`)
  in code from R/G/B values.

### Other stuff

* `game.touchmode`: This will be (more or less) `true` if the game is being used via a touchscreen, and `false` if the game is being used
  via a mouse.

### mapcompile.py

`levels/mapcompile.py` is a Python script. It compiles levels created with [Tiled](https://mapeditor.org) into a very particular and weird
format that I use for these browser games. Sometimes I make changes to this script when the levels have objects or whatever in them as well,
so that it adds that data in too. Mostly just putting this here for my own use so I don't lose it.  Requires the [ulvl](https://ulvl.github.io/)
library, and should be run like so:

```
levels/mapcompile.py levels/*.tmx > levels.js
```

If you want to do your levels differently, feel free. I mean I'm not your mom.
