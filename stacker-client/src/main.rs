use async_trait::async_trait;
use egui_macroquad::egui;
use macroquad::prelude::*;

use crate::game::Game;

mod game;

#[async_trait]
trait Scene {
    async fn execute(&mut self) -> Box<dyn Scene>;
}

struct MainMenu;

#[async_trait]
impl Scene for MainMenu {
    async fn execute(&mut self) -> Box<dyn Scene> {
        loop {
            let mut clicked = false;

            egui_macroquad::ui(|ctx| {
                egui::CentralPanel::default().show(ctx, |ui| {
                    clicked = ui.button("play").clicked();
                });
            });

            egui_macroquad::draw();

            if clicked {
                return Box::new(Game::default());
            }

            next_frame().await;
        }
    }
}

#[macroquad::main("stacker")]
async fn main() {
    let mut scene: Box<dyn Scene> = Box::new(MainMenu);
    loop {
        scene = scene.execute().await;
    }
}
