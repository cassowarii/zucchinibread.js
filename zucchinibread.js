"use strict";

/* Please forgive my strictly procedural style here */

/* ---- Util ---- */

function goodmod(x, n) {
     return ((x%n)+n)%n;
}

/* ---- Resource loading / loading screen ---- */

let _audiocheck = document.createElement('audio');

let _SFX_ARRAY_SIZE = 10;

/* Returns a callback that should be called when a resource finishes loading. */
function _register_resource(name, game, callback) {
    game._total_things_to_load ++;
    console.log("Loading", name + ". Things to load:", game._total_things_to_load);
    return function() {
        if (!game.ready_to_go) {
            game._things_loaded ++;
            console.log("Loaded", name + ". Things loaded:", game._things_loaded, "/", game._total_things_to_load);
            _check_if_loaded(game);
            if (callback) {
                callback();
            }
        }
    }
}

function _sound_resource_error(name, game, audio) {
    return function(e) {
        if (audio === undefined) {
            console.error("Error loading resource, skipping:", name);
            game._things_loaded ++;
            _check_if_loaded(game);
        }
    }
}

function _check_if_loaded(game) {
    if (game.ready_to_go) return;

    if (game._things_loaded >= game._total_things_to_load) {
        console.log("Ready");
        game.ready_to_go = true;
        game._on_ready();
    }
}

function _register_sfx(sfxdata, game) {
    for (let key in sfxdata) {
        let sfx_array = new Array(_SFX_ARRAY_SIZE);
        for (let i = 0; i < _SFX_ARRAY_SIZE; i++) {
            sfx_array[i] = new Audio(sfxdata[key].path);
            sfx_array[i].addEventListener('canplaythrough',
                _register_resource(sfxdata[key].path + '#' + (i+1), game), false);
            sfx_array[i].addEventListener('error',
                _sound_resource_error(sfxdata[key].path + '#' + (i+1), game), false, sfx_array[i]);
            if (sfxdata[key].hasOwnProperty('volume')) {
                sfx_array[i].volume = sfxdata[key].volume;
            }
        }
        game.sfx[key] = {
            _array: sfx_array,
            _index: 0,
            play: function() {
                if (!game.muted) {
                    this._array[this._index].currentTime = 0;
                    this._array[this._index].play();
                    this._index ++;
                    this._index = goodmod(this._index, _SFX_ARRAY_SIZE);
                }
            }
        }
    }
}

function _register_music(musicdata, game) {
    for (let key in musicdata) {
        let musicpath;
        if (_audiocheck.canPlayType('audio/mpeg')) {
            musicpath = musicdata[key].path + '.mp3';
        } else if (_audiocheck.canPlayType('audio/ogg')) {
            musicpath = musicdata[key].path + '.ogg';
        } else {
            console.log("No supported music type known :(");
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
        music.addEventListener('canplaythrough', _register_resource(musicpath, game), false);
        music.addEventListener('error', _sound_resource_error(musicpath, game, music), false);

        game.music[key] = music;
    }
}

function _register_images(imgdata, game) {
    function _recursive_load_images(pathmap) {
        let result = {};
        for (let key in pathmap) {
            if (typeof pathmap[key] === 'object') {
                result[key] = _recursive_load_images(pathmap[key]);
            } else {
                result[key] = new Image();
                result[key].onload = _register_resource(pathmap[key], game);
                result[key].src = pathmap[key];
            }
        }
        return result;
    }

    let loaded_imgs = _recursive_load_images(imgdata);
    for (let k in loaded_imgs) {
        game.img[k] = loaded_imgs[k];
    }
}

function create_game (params) {
    let game_props = {...params};

    game_props.frame_rate = params.frame_rate || 60;

    game_props.canvas_w = params.canvas_w || 640;
    game_props.canvas_h = params.canvas_h || 480;
    game_props.draw_scale = params.draw_scale || 4;
    game_props.top_border = params.top_border || 0;
    game_props.bottom_border = params.bottom_border || 32;
    game_props.left_border = params.left_border || 0;
    game_props.right_border = params.right_border || 0;

    game_props.tile_size = params.tile_size || 16;
    game_props.level_w = params.level_w || 10;
    game_props.level_h = params.level_h || 7;

    game_props.screen_w = game_props.canvas_w / game_props.draw_scale;
    game_props.screen_h = game_props.canvas_h / game_props.draw_scale;

    game_props.background_color = params.background_color || '#000000';

    let canvas = document.getElementById('canvas');

    let global_ctx = canvas.getContext('2d');
    global_ctx.imageSmoothingEnabled = false;
    global_ctx.webkitImageSmoothingEnabled = false;
    global_ctx.mozImageSmoothingEnabled = false;

    let mask_canvas = document.createElement('canvas');
    let mask_ctx = mask_canvas.getContext('2d');
    mask_ctx.imageSmoothingEnabled = false;
    mask_ctx.webkitImageSmoothingEnabled = false;
    mask_ctx.mozImageSmoothingEnabled = false;

    let copy_canvas = document.createElement('canvas');
    let copy_ctx = copy_canvas.getContext('2d');
    copy_ctx.imageSmoothingEnabled = false;
    copy_ctx.webkitImageSmoothingEnabled = false;
    copy_ctx.mozImageSmoothingEnabled = false;

    let draw_canvas = document.createElement('canvas');
    let draw_ctx = draw_canvas.getContext('2d');
    draw_ctx.imageSmoothingEnabled = false;
    draw_ctx.webkitImageSmoothingEnabled = false;
    draw_ctx.mozImageSmoothingEnabled = false;

    let game = {
        /* General properties */
        ...game_props,

        /* Loading */
        ready_to_go: false,
        _total_things_to_load: 1,
        _things_loaded: 0,
        resources_ready: function() {
            this._things_loaded ++;
            console.log("Finished enumerating resources to load. Things loaded:",
                this._things_loaded, "/", this._total_things_to_load);
            _check_if_loaded(this);
        },
        _on_ready: function() {
            this.ready_to_go = true;
            if (game.img._clicktostart && game.img._clicktostart.complete) {
                game.ctx.global.save();
                game.ctx.global.scale(game.draw_scale, game.draw_scale);
                game.ctx.global.drawImage(game.img._clicktostart, 0, 0);
                game.ctx.global.restore();
            }
        },
        playing: false,
        play: function() {
            this.playing = true;
            _loop(this);
        },

        /* Audio */
        sfx: {},
        music: {},
        muted: false,
        register_sfx: function(sfxdata) {
            _register_sfx(sfxdata, this);
        },
        register_music: function(musicdata) {
            _register_music(musicdata, this);
        },

        /* Drawing */
        ctx: {
            global: global_ctx, /* context for the actual real canvas */
            mask: mask_ctx,     /* context for drawing the transition mask, gets scaled up */
            copy: copy_ctx,     /* context for copying the old screen on transition */
            draw: draw_ctx,     /* context for drawing the real level */
        },
        img: {},
        register_images: function(imgdata) {
            _register_images(imgdata, this);
        },

        /* Transition system */
        transition: _transition,
        start_transition: function(type, length, callback, on_done) {
            _start_transition(this, type, length, callback, on_done);
        },
        long_transition: function(type, length, callback, on_done) {
            _long_transition(this, type, length, callback, on_done);
        }
    };

    let loading_img = new Image();
    loading_img.onload = _register_resource('loading.png', game, function() {
        if (!game.ready_to_go) {
            game.ctx.global.save();
            game.ctx.global.scale(draw_scale, draw_scale);
            game.ctx.global.drawImage(loading_img, 0, 0);
            game.ctx.global.restore();
        }
    });
    loading_img.src = 'loading.png';

    let clicktostart_img = new Image();
    clicktostart_img.onload = _register_resource('clicktostart.png', game, function() {
        if (game.ready_to_go) {
            game.ctx.global.save();
            game.ctx.global.scale(draw_scale, draw_scale);
            game.ctx.global.drawImage(game.img._clicktostart, 0, 0);
            game.ctx.global.restore();
        }
    });
    clicktostart_img.src = 'clicktostart.png';
    game.img._clicktostart = clicktostart_img;

    return game;
}

/* ---- Game update stuff ---- */

window.requestAnimFrame = (function() {
    return window.requestAnimationFrame      ||
        window.webkitRequestAnimationFrame   ||
        window.mozRequestAnimationFrame      ||
        window.oRequestAnimationFrame        ||
        window.msRequestAnimationFrame       ||
        function(callback, element) {
            window.setTimeout(callback, 1000/60);
        };
})();

let _keep_going = true;
let _last_frame_time;
let _timedelta = 0;
function _loop(game, timestamp) {
    if (timestamp == undefined) {
        timestamp = 0;
        _last_frame_time = timestamp;
    }
    _timedelta += timestamp - _last_frame_time;
    _last_frame_time = timestamp;

    while (_timedelta >= 1000 / game.frame_rate) {
        _update(game, 1000 / game.frame_rate);
        _timedelta -= 1000 / game.frame_rate;
    }
    _draw(game);

    if (_keep_going) {
        requestAnimFrame(function(timestamp) {
            _loop(game, timestamp);
        });
    }
}

function _update(game, delta) {
    game.update_func(delta);

    if (game.transition.is_transitioning) {
        game.transition.timer += delta;
        if (game.transition.timer > game.transition.end_time) {
            _finish_transition(game);
        }
    }
}

/* ---- Drawing & transition stuff ---- */

let TransitionType = { DOTS: 1, SLIDE_DOWN: 2, SLIDE_UP: 3, FADE: 4, CIRCLE: 5 };

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
    type: TransitionType.DOTS,
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
            callback();
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

    game.transition.type = type;
    game.transition.end_time = length;

    game.ctx.copy.drawImage(game.ctx.draw.canvas, 0, 0);

    game.transition.dir_invert_v = Math.random() < 0.5;
    game.transition.dir_invert_h = Math.random() < 0.5;

    callback();

    game.transition.is_transitioning = true;
    game.transition.timer = 0;
}

function _finish_transition(game) {
    game.transition.is_transitioning = false;
    game.transition.timer = 0;

    if (game.transition.done_func) {
        setTimeout(function() {
            game.transition.done_func();
            game.transition.done_func = null;
        }, 400);
    }
}

function _draw(game) {
    let ctx = game.ctx.draw;

    ctx.save();

    ctx.fillStyle = game.background_color;

    ctx.beginPath();
    ctx.rect(0, 0, game.canvas_w, game.canvas_h);
    ctx.fill();

    game.draw_func(game.ctx.draw);

    if (game.transition.mid_long) {
        ctx.fillStyle = game.transition.color;
        ctx.fillRect(-1, -1, game.canvas_w + 5, game.canvas_h + 5);
    }

    ctx.restore();

    game.ctx.global.fillStyle = 'rgb(0, 0, 0)';
    game.ctx.global.beginPath();
    game.ctx.global.rect(0, 0, game.canvas_w * game.draw_scale, game.canvas_h * game.draw_scale);
    game.ctx.global.fill();

    game.ctx.global.save();

    game.ctx.global.scale(game.draw_scale, game.draw_scale);

    game.ctx.global.drawImage(ctx.canvas, 0, 0);

    if (game.transition.is_transitioning) {
        game.ctx.global.save();

        if (game.transition.type == TransitionType.DOTS) {
            game.ctx.mask.clearRect(0, 0, game.screen_w, game.screen_h);
            _draw_transition_dot_mask(game, game.ctx.mask);

            // Redraw to reduce antialiasing effects
            for (let i = 0; i < 5; i++) {
                game.ctx.mask.drawImage(game.ctx.mask.canvas, 0, 0);
            }

            game.ctx.mask.globalCompositeOperation = 'source-in';
            game.ctx.mask.drawImage(game.ctx.copy.canvas, 0, 0);
            game.ctx.mask.globalCompositeOperation = 'source-over';

            game.ctx.global.drawImage(game.ctx.mask.canvas, 0, 0);
        } else if (game.transition.type == TransitionType.SLIDE_DOWN) {
            let offset = game.transition.timer / game.transition.end_time * game.screen_h;

            game.ctx.global.drawImage(game.ctx.copy.canvas, 0, -offset);
            game.ctx.global.drawImage(ctx.canvas, 0, game.screen_h - offset);
        } else if (game.transition.type == TransitionType.SLIDE_UP) {
            let offset = game.transition.timer / game.transition.end_time * game.screen_h;

            game.ctx.global.drawImage(game.ctx.copy.canvas, 0, offset);
            game.ctx.global.drawImage(ctx.canvas, 0, - game.screen_h + offset);
        } else if (game.transition.type == TransitionType.FADE) {
            let alpha = 0;
            alpha = 1 - game.transition.timer / game.transition.end_time;

            game.ctx.mask.clearRect(0, 0, game.screen_w, game.screen_h);
            game.ctx.mask.fillStyle = 'rgba(255,255,255,' + alpha + ')';
            game.ctx.mask.fillRect(0, 0, game.screen_w, game.screen_h);
            game.ctx.mask.globalCompositeOperation = 'source-in';
            game.ctx.mask.drawImage(game.ctx.copy.canvas, 0, 0);
            game.ctx.mask.globalCompositeOperation = 'source-over';

            game.ctx.global.drawImage(game.ctx.mask.canvas, 0, 0);
        } else if (game.transition.type == TransitionType.CIRCLE) {
            game.ctx.mask.clearRect(0, 0, game.screen_w, game.screen_h);

            let frac = game.transition.timer / game.transition.end_time;
            if (!game.transition.invert_shape) {
                frac = 1 - frac;
            }
            frac = Math.pow(frac, 1.5);

            let cx = character.x + 0.5;
            let cy = character.y + 0.5;
            let lh = game.level_h + 1;
            let distances_to_corners = [
                Math.sqrt(Math.pow(cx * game.tile_size, 2) + Math.pow(cy * game.tile_size, 2)),
                Math.sqrt(Math.pow((game.level_w - cx) * game.tile_size, 2) + Math.pow(cy * game.tile_size, 2)),
                Math.sqrt(Math.pow(cx * game.tile_size, 2) + Math.pow((lh - cy) * game.tile_size, 2)),
                Math.sqrt(Math.pow((game.level_w - cx) * game.tile_size, 2) + Math.pow((lh - cy) * game.tile_size, 2)),
            ];
            let max_radius = Math.max(...distances_to_corners);
            let radius = frac * max_radius;

            game.ctx.mask.globalCompositeOperation = 'source-over';
            game.ctx.mask.drawImage(game.ctx.copy.canvas, 0, 0);

            game.ctx.mask.globalCompositeOperation = 'destination-out';
            game.ctx.mask.fillStyle = 'rgba(255,255,255)';
            game.ctx.mask.beginPath();
            if (!game.transition.invert_shape) {
                game.ctx.mask.rect(-5, -5, game.screen_w + 5, game.screen_h + 5);
            }
            game.ctx.mask.arc(character.x * game.tile_size + game.tile_size / 2,
                character.y * game.tile_size + game.tile_size / 2,
                radius, 0, 2 * Math.PI,
                !game.transition.invert_shape);
            game.ctx.mask.fill();

            game.ctx.mask.globalCompositeOperation = 'source-over';

            game.ctx.global.drawImage(game.ctx.mask.canvas, 0, 0);
        }

        game.ctx.global.restore();
    }

    game.ctx.global.restore();
}

function _draw_transition_dot_mask(game, ctx) {
    ctx.fillStyle = '#0000ff';
    let cell_width = game.screen_w / game.transition.w;
    let cell_height = game.screen_h / game.transition.h;
    let max_radius = 0.75 * Math.max(cell_width, cell_height);

    let transition_dot_length = game.transition.end_time * 3 / 8;

    for (let x = -1; x < game.transition.w + 1; x++) {
        for (let y = -1; y < game.transition.h + 1; y++) {
            let radius;

            let circle_start_time = (x + y) / (game.transition.w + game.transition.h)
                    * (game.transition.end_time - transition_dot_length);
            if (game.transition.timer - circle_start_time < 0) {
                if (game.transition.invert_shape) {
                    radius = 0;
                } else {
                    radius = max_radius;
                }
            } else if (game.transition.timer - circle_start_time < transition_dot_length) {
                if (game.transition.invert_shape) {
                    radius = (game.transition.timer - circle_start_time) / transition_dot_length * max_radius;
                } else {
                    radius = (1 - (game.transition.timer - circle_start_time) / transition_dot_length) * max_radius;
                }
            } else {
                if (game.transition.invert_shape) {
                    radius = max_radius;
                } else {
                    radius = 0;
                }
            }

            let draw_x = x;
            let draw_y = y;
            if (game.transition.dir_invert_v) draw_x = game.transition.w - 1 - x;
            if (game.transition.dir_invert_h) draw_y = game.transition.h - 1 - y;

            if (radius >= max_radius * 0.8) {
                if (!game.transition.invert_shape) {
                    ctx.fillRect(draw_x * cell_width, draw_y * cell_width, cell_width + 1, cell_width + 1);
                }
            } else if (radius > 0) {
                ctx.save();
                ctx.beginPath();
                if (game.transition.invert_shape) {
                    ctx.rect(draw_x * cell_width, draw_y * cell_width, cell_width + 3, cell_width + 3);
                }
                ctx.moveTo(draw_x * cell_width + cell_width / 2, draw_y * cell_width + cell_width / 2);
                ctx.arc(draw_x * cell_width + cell_width / 2,
                         draw_y * cell_width + cell_width / 2,
                         radius, 0, 2 * Math.PI, game.transition.invert_shape);
                ctx.clip();
                ctx.fillRect(draw_x * cell_width, draw_y * cell_width, cell_width, cell_width);
                ctx.restore();
            } else {
                if (game.transition.invert_shape) {
                    ctx.fillRect(draw_x * cell_width, draw_y * cell_width, cell_width + 3, cell_width + 3);
                }
            }
        }
    }
}
