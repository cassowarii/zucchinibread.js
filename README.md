# zucchinibread.js

This is a distillation of some of the code I've been using to make puzzle games for the last little while. Code for loading/managing audio, loading/displaying images, running a very simple game loop, as well as a quite general and extensible 'screen transition' system. You could charitably call it a "game engine," but that might be giving it a little too much credit. I will probably add support for other stuff I like later (like spritesheets and map drawing), but I'm trying to be conservative with what I move into the library in case I need to change behaviors later.

## How do?

### setup

Make sure your `index.html` has a `<canvas>` element with the id `canvas`. This is the canvas that will be used for drawing. I will add a feature to let you change that later.

Create a file `game.js`. Here is how to initialize your game:

```
let game;

ready(function() {
    game = create_game({
        canvas: 'mycanvas',          /* ID of your canvas element */
        canvas_w: 640,               /* Width of your drawing canvas */
        canvas_h: 480,               /* Height of your drawing canvas */
        draw_scale: 4,               /* How much the pixels should be scaled up. */
        background_color: '#000000', /* Background color that will be drawn underneath everything you draw */
        draw_func: do_draw,          /* Function that will be called in the game loop to render the game */
        update_func: do_update,      /* Function that will be called to update the game state - 1 parameter, time delta of update in ms */

        events: {
            mouseup: mouseup_func,
            keydown: keydown_func,
            /* etc. */
        },                          /* Callbacks for events. Receive the game object as 1st parameter, event 2nd. */

        /* Optional parameters you can add: */
        tile_size: 8,                /* How big each 'tile' in your game is. (optional, mostly just for you) */
        level_w: 20,                 /* Width of your game levels. (optional, mostly just for you) */
        level_h: 14,                 /* Height of your game levels. (same) */
        frame_rate: 60,              /* Frame rate the game will run at - optional, default 60 */
        run_in_background: true,     /* disable auto-pausing when clicking away from game (optional, default false) */
    });

    /* CALL THE OTHER REGISTER FUNCTIONS (EXPLAINED BELOW) HERE IF YOU HAVE THEM */

    game.resources_ready();

    /* Do any other initialization you need to here. */
});
```

Make sure you call `resources_ready()` after you register all your resources, or the game will never finish loading. It's like a safety feature, to let the game know you're done telling it to load new stuff.

Also, make sure to provide three images in the root folder: `loading.png`, `clicktostart.png`, and `pause.png`, which will be drawn over the full screen (a) when the game is loading; (b) when it has finished loading and should be clicked to start; (c) when you click out of the game and it pauses. (`pause.png` is optional if `run_in_background` is enabled)

### resource loading


Here are the things the engine knows how to do, which you should load :

#### sound effects

```
game.register_sfx({
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

```
game.register_images({
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

This will cause the game to go and find these images and load them in for you. You can access them later at `game.img.tiles` or whatever. As you can see here, you can also provide a more complex nested series of paths, and it will handle them correctly (in this example the enemy image objects will be accessible at `game.img.enemies.bean`, etc.)

#### music

```
game.register_music({
    bgm1: {
        path: 'music/bgm1',
        volume: 0.5,
    }
    bgm2: {
        path: 'music/bgm2',
        volume: 0.5,
    },
});
```

This will pull the proper music files. Note that you **should not specify a file extension**. It will add either `.mp3` or `.ogg` depending on what is supported by your browser, so be sure to provide both (if you don't want to do both, it defaults to mp3 and I think most browsers nowadays support mp3? Firefox didn't used to I'm pretty sure)

### mapcompile.py

`levels/mapcompile.py` is a Python script. It compiles levels created with [Tiled](https://mapeditor.org) into a very particular and stupid format. Sometimes I make changes to this script when the levels have objects or whatever in them as well, and it adds that data in too. Requires the [ulvl](https://ulvl.github.io/) library, and should be run like so:

```
levels/mapcompile.py levels/*.tmx > levels.js
```

If you want to do your levels differently, feel free. I mean I'm not your mom.
