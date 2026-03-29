use std::time::Instant;

use async_trait::async_trait;
use macroquad::prelude::*;
use stacker_engine::{
    Action, Cell, Config, Coords, Direction, Engine, GRID_HEIGHT, HoldPiece, Input, PILE_WIDTH,
    Piece, PieceKind,
};

const BLOCK_SIZE: f32 = 25.;

#[async_trait]
trait Scene {
    async fn execute(&mut self) -> Box<dyn Scene>;
}

struct Game {
    engine: Engine,
    prev_time: Instant,
    residue: f64,
    inputs: Vec<Input>,
}

impl Default for Game {
    fn default() -> Game {
        Game {
            engine: Engine::new(
                0,
                Config {
                    das: 6,
                    arr: 0,
                    are: 0,
                    gravity: 60,
                    softdrop: 0,
                    clear_delay: 0,
                },
            ),
            prev_time: Instant::now(),
            residue: 0.0,
            inputs: vec![],
        }
    }
}

impl Game {
    fn handle_input(&mut self) {
        let mapping = [
            (KeyCode::A, Action::Hold),
            (KeyCode::S, Action::Flip),
            (KeyCode::D, Action::Rotate(Direction::Left)),
            (KeyCode::F, Action::Rotate(Direction::Right)),
            (KeyCode::Space, Action::Harddrop),
            (KeyCode::J, Action::Move(Direction::Left)),
            (KeyCode::K, Action::Softdrop),
            (KeyCode::L, Action::Move(Direction::Right)),
        ];

        for (key, action) in mapping {
            if is_key_pressed(key) {
                self.inputs.push(Input::Begin(action));
            }

            if is_key_released(key) {
                self.inputs.push(Input::End(action));
            }
        }
    }
}

#[async_trait]
impl Scene for Game {
    async fn execute(&mut self) -> Box<dyn Scene> {
        loop {
            let time = Instant::now();
            let delta = time - self.prev_time;
            self.residue += delta.as_secs_f64();

            self.handle_input();

            if is_key_pressed(KeyCode::P) {
                self.engine.queue_garbage(5);
            }

            while self.residue >= 1.0 / 60.0 {
                self.engine.update(&self.inputs);
                self.inputs.clear();
                self.residue -= 1.0 / 60.0
            }

            clear_background(WHITE);

            let offset_x = (screen_width() - PILE_WIDTH as f32 * BLOCK_SIZE) / 2.;
            let offset_y = (screen_height() - GRID_HEIGHT as f32 * BLOCK_SIZE) / 2.;

            for (y, row) in self.engine.pile().iter().enumerate() {
                for (x, &block) in row.iter().enumerate() {
                    let block_x = offset_x + x as f32 * BLOCK_SIZE;
                    let block_y = offset_y + (GRID_HEIGHT - y as i32 - 1) as f32 * BLOCK_SIZE;

                    if let Some(Cell::PieceKind(piece)) = block {
                        draw_rectangle(
                            block_x,
                            block_y,
                            BLOCK_SIZE,
                            BLOCK_SIZE,
                            if !self.engine.game_over() {
                                piece_color(piece)
                            } else {
                                DARKGRAY
                            },
                        );
                    } else if block == Some(Cell::Garbage) {
                        draw_rectangle(block_x, block_y, BLOCK_SIZE, BLOCK_SIZE, GRAY);
                    } else if y < GRID_HEIGHT as usize {
                        draw_rectangle_lines(block_x, block_y, BLOCK_SIZE, BLOCK_SIZE, 1., GRAY);
                    }
                }
            }

            if let Some(HoldPiece { kind, is_locked }) = self.engine.hold() {
                for (x, y) in piece_blocks(*kind) {
                    let x = offset_x + (x - 4) as f32 * BLOCK_SIZE;
                    let y = offset_y + (GRID_HEIGHT - y - 4 as i32 * 3 - 7) as f32 * BLOCK_SIZE;

                    draw_rectangle(
                        x,
                        y,
                        BLOCK_SIZE,
                        BLOCK_SIZE,
                        if *is_locked { GRAY } else { piece_color(*kind) },
                    );
                }
            }

            for (index, piece) in self.engine.next_queue().enumerate() {
                for (x, y) in piece_blocks(piece) {
                    let x = offset_x + (x + 12) as f32 * BLOCK_SIZE;
                    let y = offset_y
                        + (GRID_HEIGHT - y - (4 - index) as i32 * 3 - 7) as f32 * BLOCK_SIZE;

                    draw_rectangle(x, y, BLOCK_SIZE, BLOCK_SIZE, piece_color(piece));
                }
            }

            if let Some(ghost_piece) = self.engine.ghost_piece() {
                for (x, y) in ghost_piece.blocks {
                    let x = offset_x + x as f32 * BLOCK_SIZE;
                    let y = offset_y + (GRID_HEIGHT - y - 1) as f32 * BLOCK_SIZE;

                    draw_rectangle(
                        x,
                        y,
                        BLOCK_SIZE,
                        BLOCK_SIZE,
                        Color {
                            r: 0.,
                            g: 0.,
                            b: 0.,
                            a: 0.2,
                        },
                    );
                }
            }

            if let Some(active_piece) = self.engine.active_piece() {
                for (x, y) in active_piece.blocks {
                    let x = offset_x + x as f32 * BLOCK_SIZE;
                    let y = offset_y + (GRID_HEIGHT - y - 1) as f32 * BLOCK_SIZE;

                    draw_rectangle(x, y, BLOCK_SIZE, BLOCK_SIZE, piece_color(active_piece.kind));
                }
            }

            draw_text(
                &format!("combo: {}", self.engine.combo()),
                0.,
                100.,
                30.,
                BLACK,
            );
            draw_text(
                &format!("back-to-back: {}", self.engine.back_to_back()),
                0.,
                150.,
                30.,
                BLACK,
            );

            self.prev_time = time;
            next_frame().await;
        }
    }
}

#[macroquad::main("stacker")]
async fn main() {
    let mut scene: Box<dyn Scene> = Box::new(Game::default());
    loop {
        scene = scene.execute().await;
    }
}

fn piece_color(piece: PieceKind) -> Color {
    match piece {
        PieceKind::I => SKYBLUE,
        PieceKind::O => YELLOW,
        PieceKind::T => PURPLE,
        PieceKind::L => ORANGE,
        PieceKind::Z => RED,
        PieceKind::J => BLUE,
        PieceKind::S => GREEN,
    }
}

fn piece_blocks(piece: PieceKind) -> [Coords; 4] {
    let blocks = Piece::spawn(piece).blocks;

    let min_x = blocks.map(|(x, _y)| x).iter().copied().min().unwrap();
    let min_y = blocks.map(|(_x, y)| y).iter().copied().min().unwrap();

    blocks.map(|(x, y)| (x - min_x, y - min_y))
}
