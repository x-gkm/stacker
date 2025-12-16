use std::time::Instant;

use macroquad::prelude::*;

const PILE_HEIGHT: usize = 40;
const PILE_WIDTH: usize = 10;
const GRID_HEIGHT: i32 = 20;
const BLOCK_SIZE: f32 = 25.;
const ENGINE_FPS: i32 = 60;
const FRAME_TIME: u128 = 1_000_000_000 / ENGINE_FPS as u128;

#[derive(Debug, Copy, Clone)]
enum Piece {
    I,
    O,
    T,
    L,
    Z,
    J,
    S,
}

#[derive(Debug, Copy, Clone)]
enum Orientation {
    N,
    E,
    S,
    W,
}

#[macroquad::main("stacker")]
async fn main() {
    let mut pile: [[Option<Piece>; PILE_WIDTH]; PILE_HEIGHT] = [[None; PILE_WIDTH]; PILE_HEIGHT];
    let mut active_piece = ActivePiece::spawn(Piece::T);

    let mut prev_time = Instant::now();
    let mut residue_time = 0;
    let mut gravity_time = 0;
    loop {
        let time = Instant::now();
        let delta = time - prev_time;

        let nanos = delta.as_nanos() + residue_time;

        residue_time = nanos % FRAME_TIME;
        let n = nanos / FRAME_TIME;

        for _ in 0..n {
            gravity_time += 1;
            if gravity_time >= ENGINE_FPS {
                gravity_time -= ENGINE_FPS;
                let mut branched_piece = active_piece.clone();
                branched_piece.y -= 1;
                branched_piece.update_blocks();
                if !check_collision(&pile, &branched_piece.blocks) {
                    active_piece = branched_piece;
                }
            }
        }

        clear_background(WHITE);

        let offset_x = (screen_width() - PILE_WIDTH as f32 * BLOCK_SIZE) / 2.;
        let offset_y = (screen_height() - GRID_HEIGHT as f32 * BLOCK_SIZE) / 2.;

        for (y, row) in pile.iter().enumerate() {
            for (x, &block) in row.iter().enumerate() {
                let block_x = offset_x + x as f32 * BLOCK_SIZE;
                let block_y = offset_y + (GRID_HEIGHT - y as i32 - 1) as f32 * BLOCK_SIZE;

                if let Some(piece) = block {
                    draw_rectangle(block_x, block_y, BLOCK_SIZE, BLOCK_SIZE, piece.color());
                } else if y < GRID_HEIGHT as usize {
                    draw_rectangle_lines(block_x, block_y, BLOCK_SIZE, BLOCK_SIZE, 1., GRAY);
                }
            }
        }

        for (x, y) in active_piece.blocks {
            let x = offset_x + x as f32 * BLOCK_SIZE;
            let y = offset_y + (GRID_HEIGHT - y - 1) as f32 * BLOCK_SIZE;

            draw_rectangle(x, y, BLOCK_SIZE, BLOCK_SIZE, active_piece.kind.color());
        }

        prev_time = time;
        next_frame().await;
    }
}

#[derive(Debug, Clone)]
struct ActivePiece {
    kind: Piece,
    orientation: Orientation,
    x: i32,
    y: i32,
    blocks: [(i32, i32); 4],
}

impl Piece {
    fn blocks(self, orientation: Orientation) -> [(i32, i32); 4] {
        match (self, orientation) {
            (Piece::I, Orientation::N) => [(0, 0), (-1, 0), (1, 0), (2, 0)],
            (Piece::I, Orientation::E) => [(0, 0), (0, -2), (0, -1), (0, 1)],
            (Piece::I, Orientation::S) => [(0, 0), (-2, 0), (-1, 0), (1, 0)],
            (Piece::I, Orientation::W) => [(0, 0), (0, -1), (0, 1), (0, 2)],

            (Piece::O, Orientation::N) => [(0, 0), (0, 1), (1, 1), (1, 0)],
            (Piece::O, Orientation::E) => [(0, 0), (0, -1), (1, -1), (1, 0)],
            (Piece::O, Orientation::S) => [(0, 0), (0, -1), (-1, -1), (-1, 0)],
            (Piece::O, Orientation::W) => [(0, 0), (0, 1), (-1, 1), (-1, 0)],

            (Piece::T, Orientation::N) => [(0, 0), (-1, 0), (0, 1), (1, 0)],
            (Piece::T, Orientation::E) => [(0, 0), (0, 1), (1, 0), (0, -1)],
            (Piece::T, Orientation::S) => [(0, 0), (-1, 0), (0, -1), (1, 0)],
            (Piece::T, Orientation::W) => [(0, 0), (0, 1), (-1, 0), (0, -1)],

            (Piece::L, Orientation::N) => [(0, 0), (-1, 0), (1, 1), (1, 0)],
            (Piece::L, Orientation::E) => [(0, 0), (0, 1), (1, -1), (0, -1)],
            (Piece::L, Orientation::S) => [(0, 0), (-1, 0), (-1, -1), (1, 0)],
            (Piece::L, Orientation::W) => [(0, 0), (0, 1), (-1, 1), (0, -1)],

            (Piece::Z, Orientation::N) => [(0, 0), (-1, 1), (0, 1), (1, 0)],
            (Piece::Z, Orientation::E) => [(0, 0), (1, 1), (1, 0), (0, -1)],
            (Piece::Z, Orientation::S) => [(0, 0), (-1, 0), (0, -1), (1, -1)],
            (Piece::Z, Orientation::W) => [(0, 0), (0, 1), (-1, 0), (-1, -1)],

            (Piece::J, Orientation::N) => [(0, 0), (-1, 0), (-1, 1), (1, 0)],
            (Piece::J, Orientation::E) => [(0, 0), (0, 1), (1, 1), (0, -1)],
            (Piece::J, Orientation::S) => [(0, 0), (-1, 0), (1, -1), (1, 0)],
            (Piece::J, Orientation::W) => [(0, 0), (0, 1), (-1, -1), (0, -1)],

            (Piece::S, Orientation::N) => [(0, 0), (1, 1), (0, 1), (-1, 0)],
            (Piece::S, Orientation::E) => [(0, 0), (1, -1), (1, 0), (0, 1)],
            (Piece::S, Orientation::S) => [(0, 0), (1, 0), (0, -1), (-1, -1)],
            (Piece::S, Orientation::W) => [(0, 0), (0, -1), (-1, 0), (-1, 1)],
        }
    }

    fn color(self) -> Color {
        match self {
            Piece::I => SKYBLUE,
            Piece::O => YELLOW,
            Piece::T => PURPLE,
            Piece::L => ORANGE,
            Piece::Z => RED,
            Piece::J => BLUE,
            Piece::S => GREEN,
        }
    }
}

impl ActivePiece {
    fn spawn(kind: Piece) -> ActivePiece {
        let x = PILE_WIDTH as i32 / 2 - 1;
        let y = GRID_HEIGHT as i32 + 2;
        let orientation = Orientation::N;

        let mut result = ActivePiece {
            kind,
            orientation,
            x,
            y,
            blocks: [(0, 0); 4],
        };

        result.update_blocks();

        result
    }

    fn update_blocks(&mut self) {
        self.blocks = self
            .kind
            .blocks(self.orientation)
            .map(|(bx, by)| (self.x + bx, self.y + by));
    }
}

fn check_collision(pile: &[[Option<Piece>; PILE_WIDTH]; PILE_HEIGHT], blocks: &[(i32, i32)]) -> bool {
    for &(x, y) in blocks {
        if x < 0 || x >= PILE_WIDTH as i32 || y < 0 || y >= PILE_HEIGHT as i32 {
            return true;
        }

        if let Some(_) = pile[y as usize][x as usize] {
            return true;
        }
    }

    false
}
