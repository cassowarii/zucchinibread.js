"use strict";

/* There are programming patterns in here that no one should ever have discovered.
 * Proceed at your own risk. */

let zb = (function() {
    /* ---- Util ---- */

    function mod(x, n) {
         return ((x%n)+n)%n;
    }

    function sgn(x) {
         if (x === 0) {
             return 0;
         } else {
             return x / Math.abs(x);
         }
    }

    function as_hex(num, length) {
        let result = Math.round(num).toString(16);

        if (length) {
            while (result.length < length) {
                result = "0" + result;
            }
        }

        return result;
    }

    function copy_list(list) {
        let newlist = [];
        for (let x of list) {
            newlist.push(x);
        }
        return newlist;
    }

    function copy_flat_objlist(list) {
        let newlist = [];
        for (let x of list) {
            newlist.push({ ...x });
        }
        return newlist;
    }

    function rand_int(a, b) {
        let min = 0;
        let max = 0;
        if (b === undefined) {
            max = a;
        } else {
            min = a;
            max = b;
        }
        return Math.floor(Math.random() * (max - min) + min);
    }

    /* ---- Interface to game code ---- */

    function implicit_bind(context, func) {
        /* cursed and evil javascript magic */
        /* lets us temporarily bind globals like dynamic scope,
         * so we can pass in properties like 'game' to our functions
         * without needing to call them directly */
        /* this lets us namespace stuff under 'game' or 'draw'
         * but also not have those namespaces actually accessible
         * from the global scope. but they will be accessible
         * in all child function calls! aah! */
        let original_props = {}
        for (let key of Object.keys(context)) {
            original_props[key] = globalThis[key];
            globalThis[key] = context[key];
        }

        let result = func();

        for (let key of Object.keys(context)) {
            globalThis[key] = original_props[key];
        }

        return result;
    }

    function call_game_func(game, func, args) {
        return implicit_bind({ game: game }, () => {
            func.apply(game, args);
        });
    }

    function call_draw_func(game, draw, func, args) {
        return implicit_bind({ game: game, draw: draw }, () => {
            func.apply(game, args);
        });
    }

    /* ---- Resource loading / loading screen ---- */

    let _audiocheck = document.createElement('audio');

    let _SFX_ARRAY_SIZE = 10;

    /* Update progress bar if the progress bar is activated. */
    function _update_progress_bar(game) {
        if (game.load_with_progress_bar) {
            if (game._progressbar_img_loaded) {
                game.ctx.global.save();
                game.ctx.global.scale(game.draw_scale, game.draw_scale);
                if (!game.img._progressbar.failed_to_load) {
                    game.ctx.global.drawImage(
                        game.img._progressbar,
                        0,
                        0,
                        Math.round(game._things_loaded / game._total_things_to_load * game.img._progressbar.width),
                        game.img._progressbar.height,
                        Math.round(game.canvas_w / 2 / game.draw_scale - game.img._progressbar.width / 2),
                        Math.round(game.canvas_h / 2 / game.draw_scale - game.img._progressbar.height / 2),
                        Math.round(game._things_loaded / game._total_things_to_load * game.img._progressbar.width),
                        game.img._progressbar.height,
                    );
                }
                game.ctx.global.restore();
            }
        }
    }

    /* Returns a callback that should be called when a resource finishes loading. */
    function _register_resource(name, game, callback) {
        game._total_things_to_load ++;
        console.log("Loading", name + ". Things to load:", game._total_things_to_load);
        return function() {
            if (!game.ready_to_go) {
                game._things_loaded ++;
                console.log("Loaded", name + ". Things loaded:", game._things_loaded, "/", game._total_things_to_load);
                _update_progress_bar(game);
                _check_if_loaded(game);
                if (callback) {
                    callback();
                }
            }
        }
    }

    function _set_resource_load_handlers(game, resource, success_event, name, callback) {
        /* Check if resource successfully loaded and update loading screen. */
        resource.addEventListener(success_event, _register_resource(name, game, callback), false);

        /* Check if resource failed to load bc file doesn't exist and print error message. */
        resource.addEventListener('error', function(e) {
            resource.failed_to_load = true;
            game._things_loaded ++;
            console.error("Error loading resource, skipping:", name);
            _update_progress_bar(game);
            _check_if_loaded(game);
        }, false);
    }

    /* Call any queued setup functions in game context (after waiting for things to load, maybe)
     * and clear the setup function queue */
    function _call_setup_funcs(game) {
        for (let setupfunc of game._setup_funcs) {
            call_game_func(game, setupfunc, []);
        }

        /* clear queue */
        game._setup_funcs = [];
    }

    /* Check if the game has loaded everything and if so show the 'click to start' image */
    function _check_if_loaded(game) {
        if (game.ready_to_go) return;

        if (game._things_loaded >= game._total_things_to_load) {
            console.log("Ready");
            game.ready_to_go = true;
            game._waiting_for_resources = false;
            _call_setup_funcs(game);
            game._on_ready();
        }
    }

    function _register_sfx(sfxdata, game) {
        for (let key in sfxdata) {
            let sfx_size = sfxdata[key].copies || _SFX_ARRAY_SIZE;
            let sfx_array = new Array(sfx_size);
            for (let i = 0; i < sfx_size; i++) {
                let resource_name = sfxdata[key].path + '#' + (i+1);
                sfx_array[i] = new Audio(sfxdata[key].path);
                _set_resource_load_handlers(game, sfx_array[i], 'canplaythrough', resource_name);
                if (sfxdata[key].hasOwnProperty('volume')) {
                    sfx_array[i].volume = sfxdata[key].volume;
                }
            }
            game.sfx[key] = {
                _array: sfx_array,
                _index: 0,
                play: function() {
                    if (this.failed_to_load) return;

                    if (!game.muted) {
                        this._array[this._index].currentTime = 0;
                        this._array[this._index].play();
                        this._index ++;
                        this._index = mod(this._index, _SFX_ARRAY_SIZE);
                    }
                }
            }
        }

        return game;
    }

    function _register_music(musicdata, game) {
        for (let key in musicdata) {
            let musicpath;
            if (musicdata[key].path.match(/\.[a-z0-9]+$/i)) {
                musicpath = musicdata[key].path;
            } else if (_audiocheck.canPlayType('audio/mpeg')) {
                musicpath = musicdata[key].path + '.mp3';
            } else if (_audiocheck.canPlayType('audio/ogg')) {
                musicpath = musicdata[key].path + '.ogg';
            } else {
                console.error("Browser knows how to play neither mp3 nor ogg :(");
                return;
            }
            let music = new Audio(musicpath);
            if (musicdata[key].hasOwnProperty('volume')) {
                music.volume = musicdata[key].volume;
            }

            if (!musicdata[key].hasOwnProperty('loop') || musicdata[key].loop) {
                /* We loop by default unless 'loop: false' is specified. */
                music.loop = true;
            }

            _set_resource_load_handlers(game, music, 'canplaythrough', musicpath);

            /* Handle music changes when muted, so when we unmute,
             * the correct music will be playing. */
            music._og_play = music.play;
            music.play = function() {
                if (music.failed_to_load) return;

                if (game.muted) {
                    music.was_playing = true;
                } else {
                    music._og_play();
                }
            }

            music._og_pause = music.pause;
            music.pause = function() {
                if (music.failed_to_load) return;

                if (game.muted) {
                    music.was_playing = false;
                } else {
                    music._og_pause();
                }
            }

            game.music[key] = music;
        }

        return game;
    }

    function _register_images(imgdata, game) {
        function _recursive_load_images(pathmap) {
            let result = {};
            for (let key in pathmap) {
                if (typeof pathmap[key] === 'object') {
                    result[key] = _recursive_load_images(pathmap[key]);
                } else {
                    result[key] = new Image();
                    _set_resource_load_handlers(game, result[key], 'load', pathmap[key]);
                    result[key].src = pathmap[key];
                }
            }
            return result;
        }

        let loaded_imgs = _recursive_load_images(imgdata);
        for (let k in loaded_imgs) {
            game.img[k] = loaded_imgs[k];
        }

        return game;
    }

    function _create_canvas_context(canvas) {
        let new_canvas = document.createElement('canvas');
        new_canvas.width = canvas.width;
        new_canvas.height = canvas.height;

        let new_ctx = new_canvas.getContext('2d');
        new_ctx.imageSmoothingEnabled = false;
        new_ctx.webkitImageSmoothingEnabled = false;
        new_ctx.mozImageSmoothingEnabled = false;

        return new_ctx;
    }

    function _generate_draw_context(canvas_ctx) {
        /* this generates the magic 'draw' objects that get passed in
         * implicitly to the draw event functions. we can still get
         * at the original canvas context by `draw.context`, but this
         * way, what is getting drawn onto is implicitly passed with
         * `implicit_bind`, so we don't have to remember to pass `ctx`
         * to every drawing function (which i always forget) but we
         * can still draw to the correct canvas for stuff like
         * custom transitions */
        return {
            context: canvas_ctx,

            image: ((function(ctx) {
                return function(img, x, y) {
                    image_draw(ctx, img, x, y);
                };
            })(canvas_ctx)),

            screen: ((function(ctx) {
                return function(img) {
                    screen_draw(ctx);
                };
            })(canvas_ctx)),

            sprite: ((function(ctx) {
                return function(img, section_w, section_h, section_x, section_y, dest_x, dest_y) {
                    sprite_draw(ctx, img, section_w, section_h, section_x, section_y, dest_x, dest_y);
                };
            })(canvas_ctx)),

            buttons: ((function(ctx) {
                return function(button_data) {
                    button_draw(ctx, button_data);
                };
            })(canvas_ctx)),

            scoped: ((function(ctx) {
                return function(scopefunc) {
                    ctx.save();
                    scopefunc();
                    ctx.restore();
                };
            })(canvas_ctx)),

            translate: ((function(ctx) {
                return function(x, y) {
                    ctx.translate(Math.round(x), Math.round(y));
                };
            })(canvas_ctx)),

            rotate: ((function(ctx) {
                return function(radians) {
                    ctx.rotate(radians);
                };
            })(canvas_ctx)),

            rotate_deg: ((function(ctx) {
                return function(degrees) {
                    ctx.rotate(degrees * Math.PI / 180);
                };
            })(canvas_ctx)),
        };
    }

    function create_game(params) {
        let game_props = {...params};

        game_props.frame_rate = params.frame_rate || 60;
        game_props.draw_scale = params.draw_scale || 4;
        game_props.background_color = params.background_color || '#000000';

        let canvas = document.getElementById(game_props.canvas);

        let global_ctx = canvas.getContext('2d');
        global_ctx.imageSmoothingEnabled = false;
        global_ctx.webkitImageSmoothingEnabled = false;
        global_ctx.mozImageSmoothingEnabled = false;
        let global_draw = _generate_draw_context(global_ctx);

        let mask_canvas = document.createElement('canvas');
        mask_canvas.width = canvas.width;
        mask_canvas.height = canvas.height;
        let mask_ctx = mask_canvas.getContext('2d');
        mask_ctx.imageSmoothingEnabled = false;
        mask_ctx.webkitImageSmoothingEnabled = false;
        mask_ctx.mozImageSmoothingEnabled = false;
        let mask_draw = _generate_draw_context(mask_ctx);

        let copy_canvas = document.createElement('canvas');
        copy_canvas.width = canvas.width;
        copy_canvas.height = canvas.height;
        let copy_ctx = copy_canvas.getContext('2d');
        copy_ctx.imageSmoothingEnabled = false;
        copy_ctx.webkitImageSmoothingEnabled = false;
        copy_ctx.mozImageSmoothingEnabled = false;
        let copy_draw = _generate_draw_context(copy_ctx);

        let draw_canvas = document.createElement('canvas');
        draw_canvas.width = canvas.width;
        draw_canvas.height = canvas.height;
        let draw_ctx = draw_canvas.getContext('2d');
        draw_ctx.imageSmoothingEnabled = false;
        draw_ctx.webkitImageSmoothingEnabled = false;
        draw_ctx.mozImageSmoothingEnabled = false;
        let draw_draw = _generate_draw_context(draw_ctx);

        let game = {
            /* Defaults that can be overridden */
            run_in_background: true,
            load_with_progress_bar: true,

            /* General properties */
            ...game_props,

            canvas: canvas,

            /* Loading */
            ready_to_go: false,
            _total_things_to_load: 1,
            _things_loaded: 0,
            _waiting_for_resources: false,
            _setup_funcs: [],
            resources_ready: function() {
                this._things_loaded ++;
                console.log("Finished enumerating resources to load. Things loaded:",
                    this._things_loaded, "/", this._total_things_to_load);
                this._waiting_for_resources = true;
                _check_if_loaded(this);
                return this;
            },
            _on_ready: function() {
                if (this.img._clicktostart && this.img._clicktostart.complete) {
                    this.ctx.global.save();
                    this.ctx.global.scale(this.draw_scale, this.draw_scale);
                    if (!this.img._clicktostart.failed_to_load) {
                        this.ctx.global.drawImage(this.img._clicktostart, 0, 0);
                    }
                    this.ctx.global.restore();
                }
            },
            playing: false,
            play: function() {
                this.playing = true;
                if (this.events.gamestart) {
                    call_game_func(this, this.events.gamestart, []);
                }
                _loop(this);
            },
            _norun: false,
            setup: function(setupfunc) {
                if (this._waiting_for_resources) {
                    /* If we said resources_ready() before calling setup, then
                     * the setup function will get queued until everything is
                     * loaded. This allows us to let the setup function depend
                     * on properties of the things that are loaded (eg image
                     * sizes, etc) */
                    /* TODO: It would be kind of neat to queue the other resource
                     * loading functions as well if _waiting_for_resources is
                     * set so that resources_ready() really always waits for
                     * stuff to load before proceeding. But that might mess
                     * with the loading screen, and I don't know why this would
                     * be needed (maybe if somehow one image got loaded depending
                     * on a property of another image?) so low priority.
                     * Right now setup() is probably the only thing that depends
                     * on waiting for loads to complete. */
                    this._setup_funcs.push(setupfunc);
                } else {
                    /* If we aren't waiting for resources (ie either everything
                     * already loaded, or we called setup() before calling
                     * resources_ready()), just call the setupfunc directly */
                    call_game_func(this, setupfunc, []);
                }

                return this;
            },

            /* Audio */
            sfx: {},
            music: {},
            muted: false,
            mute: function() {
                _mute(this);
            },
            unmute: function() {
                _unmute(this);
            },
            toggle_mute: function() {
                if (this.muted) {
                    _unmute(this);
                } else {
                    _mute(this);
                }
            },
            register_sfx: function(sfxdata) {
                return _register_sfx(sfxdata, this);
            },
            register_music: function(musicdata) {
                return _register_music(musicdata, this);
            },

            /* Drawing */
            ctx: {
                global: global_ctx, /* context for the actual real canvas */
                mask: mask_ctx,     /* context for drawing the transition mask, gets scaled up */
                copy: copy_ctx,     /* context for copying the old screen on transition */
                draw: draw_ctx,     /* context for drawing the real level */
            },
            draw_context: {
                global: global_draw,
                mask: mask_draw,
                copy: copy_draw,
                draw: draw_draw,
            },
            create_canvas_context: function() {
                /* Function to return a fresh screen-sized canvas context, if we need it. */
                return _create_canvas_context(this.canvas);
            },
            img: {},
            register_images: function(imgdata) {
                return _register_images(imgdata, this);
            },

            /* Save */
            save: function(key, data) {
                _save(game, key, data);
            },
            load: function(key) {
                return _load(game, key);
            },

            /* Transition system */
            transition: _transition,
            start_transition: function(type, length, callback, on_done) {
                _start_transition(this, type, length, callback, on_done);
            },
            long_transition: function(type, length, callback, on_done) {
                _long_transition(this, type, length, callback, on_done);
            },

            /* Input */
            touchmode: false,

            /* Mode */
            change_mode: function(newmode) {
                _change_mode(game, newmode);
            }
        };

        window.requestAnimFrame = (function() {
            return window.requestAnimationFrame      ||
                window.webkitRequestAnimationFrame   ||
                window.mozRequestAnimationFrame      ||
                window.oRequestAnimationFrame        ||
                window.msRequestAnimationFrame       ||
                function(callback, element) {
                    window.setTimeout(callback, 1000/game.frame_rate);
                };
        })();

        /* Calculate screen size */
        if (!game.canvas_w) {
            game.canvas_w = game.canvas.width;
        }

        if (!game.canvas_h) {
            game.canvas_h = game.canvas.height;
        }

        game.screen_w = game.canvas_w / game.draw_scale;
        game.screen_h = game.canvas_h / game.draw_scale;

        /* Register event listeners */
        for (let ev in params.events) {
            /* Register any other events I guess */
            canvas['on' + ev] = function(e) {
                if (game.playing && !game._norun) {
                    call_game_func(game, params.events[ev], [e]);
                }
            }
        }

        /* Override with special events */
        canvas.onmousedown = function(e) {
            if (!game._norun) {
                _handle_mousedown(game, e);
            }
        }

        canvas.onmousemove = function(e) {
            if (!game._norun) {
                _handle_mousemove(game, e);
            }
        }

        canvas.onmouseup = function(e) {
            if (!game._norun) {
                _handle_mouseup(game, e);
            }
        }

        canvas.ontouchstart = function(e) {
            if (!game._norun) {
                game.touchmode = true;
                _handle_touchstart(game, e);
            }
            e.preventDefault();
        }

        canvas.ontouchmove = function(e) {
            if (!game._norun) {
                game.touchmode = true;
                _handle_touchmove(game, e);
            }
            e.preventDefault();
        }

        canvas.ontouchend = function(e) {
            if (!game._norun) {
                game.touchmode = true;
                _handle_touchend(game, e);
            }
            e.preventDefault();
        }

        canvas.onkeydown = function(e) {
            if (!game._norun && game.events.keydown) {
                call_game_func(game, game.events.keydown, [e]);
                e.preventDefault();
            }
        }

        canvas.onkeyup = function(e) {
            if (!game._norun && game.events.keyup) {
                call_game_func(game, game.events.keyup, [e]);
                e.preventDefault();
            }
        }

        canvas.onblur = function(e) {
            if (game.playing && !game.run_in_background) {
                game._norun = true;
                _stop_music(game);
            }
        }

        canvas.onfocus = function(e) {
            if (game.playing && !game.run_in_background) {
                game._norun = false;
                if (!game.muted) {
                    _start_music(game);
                }
                _loop(game);
            }
        }

        /* Set loading stuff */
        let loading_img = new Image();
        _set_resource_load_handlers(game, loading_img, 'load', 'loading.png', function() {
            if (!game.ready_to_go) {
                game.ctx.global.save();
                game.ctx.global.scale(game.draw_scale, game.draw_scale);
                if (!loading_img.failed_to_load) {
                    game.ctx.global.drawImage(loading_img, 0, 0);
                }
                game.ctx.global.restore();
            }
        });
        loading_img.src = 'loading.png';
        game.img._loading = loading_img;

        if (game.load_with_progress_bar) {
            game._progressbar_img_loaded = false;
            game._progressbar_width = 0;
            game._progressbar_height = 0;

            let progressbar_img = new Image();
            _set_resource_load_handlers(game, progressbar_img, 'load', 'progressbar.png', function() {
                game._progressbar_img_loaded = true;
                game._progressbar_width = progressbar_img.width;
                game._progressbar_height = progressbar_img.height;
                if (!game.ready_to_go) {
                    game.ctx.global.save();
                    game.ctx.global.scale(game.draw_scale, game.draw_scale);
                    if (!loading_img.failed_to_load) {
                        game.ctx.global.drawImage(loading_img, 0, 0);
                    }
                    game.ctx.global.restore();
                }
            });
            progressbar_img.src = 'progressbar.png';
            game.img._progressbar = progressbar_img;
        }

        if (!game.run_in_background) {
            _register_images({ _pause: 'pause.png' }, game);
        }

        if (game.hasOwnProperty('save_key')) {
            _register_images({ _saveerror: 'saveerror.png' }, game);
        }

        let clicktostart_img = new Image();
        _set_resource_load_handlers(game, clicktostart_img, 'load', 'clicktostart.png', function() {
            if (game.ready_to_go) {
                game.ctx.global.save();
                game.ctx.global.scale(game.draw_scale, game.draw_scale);
                if (!game.img._clicktostart.failed_to_load) {
                    game.ctx.global.drawImage(game.img._clicktostart, 0, 0);
                }
                game.ctx.global.restore();
            }
        });
        clicktostart_img.src = 'clicktostart.png';
        game.img._clicktostart = clicktostart_img;

        return game;
    }

    /* ---- Audio ---- */

    function _stop_music(game) {
        if (game.muted) return;

        for (let m in game.music) {
            if (!game.music[m].paused) {
                game.music[m].was_playing = true;
                game.music[m].pause();
            } else {
                game.music[m].was_playing = false;
            }
        }
    }

    function _start_music(game, unmuting) {
        if (game.muted && !unmuting) return;

        for (let m in game.music) {
            if (game.music[m].was_playing) {
                game.music[m].play();
            }
        }
    }

    function _mute(game) {
        _stop_music(game);
        game.muted = true;
    }

    function _unmute(game) {
        game.muted = false;
        _start_music(game);
    }

    /* ---- Game update stuff ---- */

    let _last_frame_time;
    let _timedelta = 0;
    function _loop(game, timestamp) {
        if (timestamp == undefined) {
            timestamp = 0;
            _last_frame_time = timestamp;
        }
        _timedelta += timestamp - _last_frame_time;
        _last_frame_time = timestamp;

        let times_updated = 0;
        while (_timedelta >= 1000 / game.frame_rate) {
            _update(game, 1000 / game.frame_rate);
            _timedelta -= 1000 / game.frame_rate;

            /* Draw at least once every 4 frames */
            /* (also sometimes we get a really big delta e.g. if
             * run_in_background: false, and we don't want to honor that) */
            times_updated ++;
            if (times_updated >= 4) {
                _timedelta = 0;
                break;
            }
        }

        _draw(game);

        if (!game._norun) {
            requestAnimFrame(function(timestamp) {
                _loop(game, timestamp);
            });
        }
    }

    function _update(game, delta) {
        if (game.update_func) {
            call_game_func(game, game.update_func, [delta]);
        }

        if (game.modes && game.modes.hasOwnProperty(game.mode) && game.modes[game.mode].update) {
            call_game_func(game, game.modes[game.mode].update, [delta]);
        }

        if (game.transition.is_transitioning) {
            game.transition.timer += delta;
            if (game.transition.timer > game.transition.end_time) {
                _finish_transition(game);
            }
        }
    }

    function _change_mode(game, newmode) {
        game.mode = newmode;
    }

    /* ---- UI ---- */

    function create_buttons(button_data) {
        for (let b of button_data.buttons) {
            b.state = 0;
        }

        return button_data;
    }

    /* Call with a button set and given x / y mouse coordinates.
     * Will update the button set in place.
     * Should generally be called in mouse move and mouse up event handlers. */
    function update_buttons(button_data, x, y) {
        for (let button of button_data.buttons) {
            if (button.state === 2) continue;
            if (button.disabled) continue;

            if (x >= button.x && x < button.x + button_data.button_w && y >= button.y && y < button.y + button_data.button_h) {
                if (!game.touchmode) {
                    button.state = 1;
                }
            } else if (button.state !== 2) {
                button.state = 0;
            }
        }
    }

    /* Call with a button set and given x / y mouse coordinates.
     * If a button is clicked, triggers its callback and returns true.
     * Otherwise, returns false.
     * Should be called in mouse down event handler. */
    function click_button(button_data, x, y) {
        for (let button of button_data.buttons) {
            if (button.disabled) continue;

            if (x >= button.x && x < button.x + button_data.button_w && y >= button.y && y < button.y + button_data.button_h) {
                button.state = 2;
                game._clicked_button = button;
                return true;
            }
        }
        return false;
    }

    function _handle_clicked_button(game) {
        if (game._clicked_button) {
            game._clicked_button.state = 0;
            _draw(game);
            if (game._clicked_button.callback) {
                call_game_func(game, game._clicked_button.callback, []);
            }
            game._clicked_button = null;
            return;
        }
    }

    /* ---- Mouse ---- */

    function _handle_mousedown(game, e) {
        game.touchmode = false;

        if (!game.playing) return;

        const rect = game.canvas.getBoundingClientRect();
        let x = Math.round((e.clientX - rect.left) / rect.width * game.screen_w) - 1;
        let y = Math.round((e.clientY - rect.top) / rect.height * game.screen_h) - 1;
        if (e.button === 0 && game.events.mousedown) {
            call_game_func(game, game.events.mousedown, [e, x, y]);
        }
    }

    function _handle_mouseup(game, e) {
        game.touchmode = false;

        if (!game.playing && game.ready_to_go) {
            /* Click to start */
            if (game.hasOwnProperty('save_key') && !game._show_save_error) {
                /* Test if save/load is working */
                try {
                    console.log("Test saving");
                    localStorage.setItem(game.save_key + ".test", "savetest");
                    let savetest = localStorage.getItem(game.save_key + ".test");
                    if (savetest !== "savetest") {
                        throw new Error("oops");
                    }
                } catch (e) {
                    /* If error saving, show save error message first */
                    /* We set _show_save_error so that the second time the user clicks,
                     * the game will actually start */
                    console.log("- SAVE FAILED -");
                    game._show_save_error = true;
                    game.ctx.global.save();
                    game.ctx.global.scale(game.draw_scale, game.draw_scale);
                    if (!game.img._saveerror.failed_to_load) {
                        game.ctx.global.drawImage(game.img._saveerror, 0, 0);
                    }
                    game.ctx.global.restore();
                    return;
                }
            }
            game.play();
            return;
        }

        const rect = game.canvas.getBoundingClientRect();
        let x = Math.round((e.clientX - rect.left) / rect.width * game.screen_w) - 1;
        let y = Math.round((e.clientY - rect.top) / rect.height * game.screen_h) - 1;

        _handle_clicked_button(game);

        if (e.button === 0 && game.events.mouseup) {
            call_game_func(game, game.events.mouseup, [e, x, y]);
        }
    }

    function _handle_mousemove(game, e) {
        game.touchmode = false;

        if (game.playing && game.events.mousemove) {
            const rect = game.canvas.getBoundingClientRect();
            let x = Math.round((e.clientX - rect.left) / rect.width * game.screen_w) - 1;
            let y = Math.round((e.clientY - rect.top) / rect.height * game.screen_h) - 1;
            call_game_func(game, game.events.mousemove, [e, x, y]);
        }
    }

    /* ---- Touch (defaults to same as mouse) ---- */

    let _last_touch_event;

    function _handle_touchstart(game, e) {
        game.touchmode = true;

        if (!game.playing) return;

        if (e.touches) e = e.touches[0];

        _last_touch_event = e;

        const rect = game.canvas.getBoundingClientRect();
        let x = Math.round((e.clientX - rect.left) / rect.width * game.screen_w) - 1;
        let y = Math.round((e.clientY - rect.top) / rect.height * game.screen_h) - 1;
        if (game.events.touchstart) {
            call_game_func(game, game.events.touchstart, [e, x, y]);
        } else if (game.events.mousedown) {
            if (game.events.mousemove) {
                call_game_func(game, game.events.mousemove, [e, x, y]);
            }
            call_game_func(game, game.events.mousedown, [e, x, y]);
        }
    }

    function _handle_touchend(game, e) {
        game.touchmode = true;

        if (!game.playing && game.ready_to_go) {
            /* Click to start */
            game.play();
            return;
        }

        const rect = game.canvas.getBoundingClientRect();
        let x = Math.round((_last_touch_event.clientX - rect.left) / rect.width * game.screen_w) - 1;
        let y = Math.round((_last_touch_event.clientY - rect.top) / rect.height * game.screen_h) - 1;

        _handle_clicked_button(game);

        if (game.events.touchend) {
            game.events.touchend(game, e, x, y);
        } else if (game.events.mouseup) {
            if (game.events.mousemove) {
                game.events.mousemove(game, e, x, y);
            }
            game.events.mouseup(game, e, x, y);
        }
    }

    function _handle_touchmove(game, e) {
        game.touchmode = true;

        if (!game.playing) return;

        if (e.touches) e = e.touches[0];

        _last_touch_event = e;

        const rect = game.canvas.getBoundingClientRect();
        let x = Math.round((e.clientX - rect.left) / rect.width * game.screen_w) - 1;
        let y = Math.round((e.clientY - rect.top) / rect.height * game.screen_h) - 1;
        if (game.events.touchmove) {
            call_game_func(game, game.events.touchmove, [e, x, y]);
        } else if (game.events.mousemove) {
            call_game_func(game, game.events.mousemove, [e, x, y]);
        }
    }

    /* ---- Drawing stuff ---- */

    function _draw(game) {
        game.ctx.draw.save();

        game.ctx.draw.save();
        game.ctx.draw.fillStyle = game.background_color;
        game.ctx.draw.fillRect(0, 0, game.screen_w, game.screen_h);
        game.ctx.draw.restore();

        if (game.draw_func) {
            call_draw_func(game, game.draw_context.draw, game.draw_func, []);
        }

        if (game.modes && game.modes.hasOwnProperty(game.mode) && game.modes[game.mode].draw) {
            call_draw_func(game, game.draw_context.draw, game.modes[game.mode].draw, []);
        }

        if (game.transition.mid_long) {
            game.ctx.draw.fillStyle = game.transition.color;
            game.ctx.draw.fillRect(-1, -1, game.canvas_w + 5, game.canvas_h + 5);
        }

        game.ctx.draw.restore();

        if (game.transition.is_transitioning) {
            call_draw_func(game, game.draw_context.mask, _draw_transition, []);
        } else {
            game.ctx.mask.drawImage(game.ctx.draw.canvas, 0, 0);
        }

        if (game.modes && game.modes.hasOwnProperty(game.mode) && game.modes[game.mode].draw_after_transition) {
            call_draw_func(game, game.draw_context.mask, game.modes[game.mode].draw_after_transition, []);
        }

        game.ctx.global.fillStyle = 'rgb(0, 0, 0)';
        game.ctx.global.fillRect(0, 0, game.screen_w * game.draw_scale, game.screen_h * game.draw_scale);

        game.ctx.global.save();

        game.ctx.global.scale(game.draw_scale, game.draw_scale);

        game.ctx.global.drawImage(game.ctx.mask.canvas, 0, 0);

        if (game._norun && !game.img._pause.failed_to_load) {
            game.ctx.global.drawImage(game.img._pause, 0, 0);
        }

        game.ctx.global.restore();
    }

    /* Draw a particular section of an image/spritesheet,
     * without having to do as much math or type the destination size */
    function sprite_draw(ctx, img, section_w, section_h, section_x, section_y, dest_x, dest_y) {
        if (!img.failed_to_load) {
            ctx.drawImage(img,
                section_w * section_x, section_h * section_y, section_w, section_h,
                Math.round(dest_x), Math.round(dest_y), section_w, section_h)
        }
    }

    /* Draw an image over the whole screen lol */
    function screen_draw(ctx, img) {
        if (!img.failed_to_load) {
            ctx.drawImage(img, 0, 0);
        }
    }

    /* Draw an image at a specified position */
    function image_draw(ctx, img, dest_x, dest_y) {
        if (!img.failed_to_load) {
            ctx.drawImage(img, Math.round(dest_x), Math.round(dest_y));
        }
    }

    /* Draw a set of buttons. */
    function button_draw(ctx, button_data) {
        for (let button of button_data.buttons) {
            if (!button.state) button.state = 0;
            let button_state = button.state;
            if (button.disabled) button_state = 3;
            sprite_draw(ctx, button_data.img, button_data.button_w, button_data.button_h, button.id, button_state, button.x, button.y);
        }
    }

    /* ---- Save ---- */

    function _save(game, key, data) {
        let save_data;

        if (!game.hasOwnProperty('save_key')) {
            throw new Error("In order to enable saving/loading, please specify a save_key property when creating the game object");
        }

        try {
            save_data = localStorage.getItem(game.save_key) || "{}";
        } catch (e) {
            console.error("Saving is disabled; cannot save " + key, e);
            return;
        }

        try {
            save_data = JSON.parse(save_data);
        } catch (e) {
            console.error("Cannot parse stored save data (when trying to save " + key + ")", e);
            return;
        }

        save_data[key] = JSON.stringify(data);

        try {
            save_data = JSON.stringify(save_data);
        } catch (e) {
            console.error("Failed to stringify save data (while trying to save " + key + ")", e);
            return;
        }

        try {
            localStorage.setItem(game.save_key, save_data);
        } catch (e) {
            console.error("Failed to save to localStorage (while saving key " + key + ")", e);
            return;
        }
    }

    function _load(game, key) {
        let save_data;

        if (!game.hasOwnProperty('save_key')) {
            throw new Error("In order to enable saving/loading, please specify a save_key property when creating the game object");
        }

        try {
            save_data = localStorage.getItem(game.save_key);
        } catch (e) {
            console.error("Loading is disabled; cannot load " + key, e);
            return;
        }

        try {
            save_data = JSON.parse(save_data);
        } catch (e) {
            console.error("Cannot parse stored save data (when trying to load " + key + ")", e);
            return;
        }

        if (!save_data) {
            return null;
        }

        return save_data[key];
    }

    /* ---- Transition stuff ---- */

    let _transition = {
        is_transitioning: false,
        timer: 0,
        color: '#000000',
        w: 20,
        h: 14,
        dir_invert_v: false,
        dir_invert_h: false,
        invert_shape: true,
        mid_long: false,
        done_func: null,
        type: _draw_fade_transition,
        nodraw: false,
        end_time: 100,
    }

    function _long_transition(game, type, length, callback) {
        if (game.transition.is_transitioning) return;

        _draw(game);

        game.transition.invert_shape = false;
        _internal_start_transition(game, type, length, function() {
            game.transition.mid_long = true;
        }, function() {
            game.transition.invert_shape = true;
            game.transition.is_transitioning = true;
            let tdiv = game.transition.dir_invert_v;
            let tdih = game.transition.dir_invert_h;
            _internal_start_transition(game, type, length, function() {
                game.transition.mid_long = false;
                call_game_func(game, callback, []);
                game.transition.dir_invert_v = tdiv;
                game.transition.dir_invert_h = tdih;
            });
        });
    }

    function _start_transition(game, type, length, callback, on_done) {
        if (game.transition.is_transitioning) return;
        if (!game.transition.nodraw) _draw(game);

        _internal_start_transition(game, type, length, callback, on_done);
    }

    function _internal_start_transition(game, type, length, callback, on_done) {
        if (on_done) {
            game.transition.done_func = on_done;
        }

        game.transition.timer = 0;
        game.transition.type = type;
        game.transition.end_time = length;

        game.ctx.copy.drawImage(game.ctx.draw.canvas, 0, 0);

        call_game_func(game, callback, []);

        game.transition.is_transitioning = true;
    }

    function _finish_transition(game) {
        game.transition.is_transitioning = false;
        game.transition.timer = 0;

        if (game.transition.done_func) {
            setTimeout(function() {
                call_game_func(game, game.transition.done_func, []);
                game.transition.done_func = null;
            }, 400);
        }
    }

    function _draw_transition() {
        let frac = game.transition.timer / game.transition.end_time;

        draw.scoped(() => {
            draw.context.clearRect(0, 0, game.screen_w, game.screen_h);
            game.transition.type(game.ctx.copy.canvas, game.ctx.draw.canvas, frac, game.transition.invert_shape);
        });
    }

    function _draw_slide_down_transition(from, to, frac, reverse) {
        let offset = frac * game.screen_h;

        draw.image(from, 0, -offset);
        draw.image(to, 0, game.screen_h - offset);
    }

    function _draw_slide_up_transition(from, to, frac, reverse) {
        let offset = frac * game.screen_h;

        draw.image(from, 0, offset);
        draw.image(to, 0, - game.screen_h + offset);
    }

    function _draw_fade_transition(from, to, frac, reverse) {
        draw.context.globalAlpha = 1;
        draw.image(from, 0, 0);
        draw.context.globalAlpha = frac;
        draw.image(to, 0, 0);
    }

    /* document.ready */
    /* Apparently, we have had DOMContentLoaded widely available since 2015.
     * I've been carrying around this ancient document.ready invocation in these games since 2017,
     * when using scary new js features might break things, but now it's been almost ten years
     * and it's not like the rest of the game code would work in IE8 or whatever. So here's the
     * simple version of ready. */
    function ready(ready_func) {
        if (document.readyState === "loading") {
            ready_func();
        } else {
            document.addEventListener("DOMContentLoaded", ready_func);
        }
    }

    /* ---- direction objects ---- */
    const _dir_up = { x: 0, y: -1, index: 0, rotate: 0, horizontal: false, vertical: true };
    const _dir_right = { x: 1, y: 0, index: 1, rotate: Math.PI / 2, horizontal: true, vertical: false };
    const _dir_down = { x: 0, y: 1, index: 2, rotate: Math.PI, horizontal: false, vertical: true };
    const _dir_left = { x: -1, y: 0, index: 3, rotate: 3 * Math.PI / 2, horizontal: true, vertical: false };
    _dir_up.opposite = _dir_down;
    _dir_down.opposite = _dir_up;
    _dir_right.opposite = _dir_left;
    _dir_left.opposite = _dir_right;

    /* ---- export zb ---- */
    return {
        create_game: create_game,

        ready: ready,
        mod: mod,
        sgn: sgn,
        as_hex: as_hex,
        copy_list: copy_list,
        copy_flat_objlist: copy_flat_objlist,

        draw: {
            sprite: sprite_draw,
            screen: screen_draw,
            image: image_draw,
            buttons: button_draw,
        },

        buttons: {
            create: create_buttons,
            update: update_buttons,
            click: click_button,
            draw: button_draw,
        },

        dir: {
            up: _dir_up,
            down: _dir_down,
            left: _dir_left,
            right: _dir_right,
        },

        phi: (1 + Math.sqrt(5)) / 2,

        transition: {
            type: {
                fade: _draw_fade_transition,
                slide_up: _draw_slide_up_transition,
                slide_down: _draw_slide_down_transition,
            },
        },
    };
})();
