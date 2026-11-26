//! Ball Twister solver: move model, state indexing, pattern databases,
//! exhaustive BFS, optimal IDA* search and a solution shortener.

pub mod data;
pub mod fullbfs;
pub mod index;
pub mod moves;
pub mod pdb;
pub mod perimeter;
pub mod shorten;
pub mod solver;
