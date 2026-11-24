-- Scheduliq - MySQL schema
CREATE DATABASE IF NOT EXISTS Scheduliq CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE Scheduliq;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('student','faculty','admin') NOT NULL DEFAULT 'student',
  department    VARCHAR(100) NULL,
  school_id     VARCHAR(50)  NULL,
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS equipment (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rooms (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(50) NOT NULL UNIQUE,
  building     VARCHAR(80) NULL,
  capacity     INT NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS room_equipment (
  room_id      INT NOT NULL,
  equipment_id INT NOT NULL,
  PRIMARY KEY (room_id, equipment_id),
  FOREIGN KEY (room_id)      REFERENCES rooms(id)     ON DELETE CASCADE,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS courses (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  code              VARCHAR(20)  NOT NULL UNIQUE,
  name              VARCHAR(150) NOT NULL,
  faculty_id        INT NULL,
  instructor_name   VARCHAR(150) NULL,
  units             TINYINT NOT NULL DEFAULT 3,
  expected_students INT NOT NULL DEFAULT 30,
  sessions_per_week TINYINT NOT NULL DEFAULT 2,
  duration_min      INT NOT NULL DEFAULT 90,
  zoom_link         VARCHAR(255) NULL,
  classroom_link    VARCHAR(255) NULL,
  FOREIGN KEY (faculty_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS course_equipment (
  course_id    INT NOT NULL,
  equipment_id INT NOT NULL,
  PRIMARY KEY (course_id, equipment_id),
  FOREIGN KEY (course_id)    REFERENCES courses(id)   ON DELETE CASCADE,
  FOREIGN KEY (equipment_id) REFERENCES equipment(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS enrollments (
  student_id INT NOT NULL,
  course_id  INT NOT NULL,
  PRIMARY KEY (student_id, course_id),
  FOREIGN KEY (student_id) REFERENCES users(id)   ON DELETE CASCADE,
  FOREIGN KEY (course_id)  REFERENCES courses(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedules (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  course_id   INT NOT NULL,
  room_id     INT NOT NULL,
  day         ENUM('Mon','Tue','Wed','Thu','Fri','Sat') NOT NULL,
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  status      ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
  batch_id    VARCHAR(40) NULL,
  created_by  INT NULL,
  reviewed_by INT NULL,
  review_note VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (course_id)   REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id)     REFERENCES rooms(id)   ON DELETE RESTRICT,
  FOREIGN KEY (created_by)  REFERENCES users(id)   ON DELETE SET NULL,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)   ON DELETE SET NULL,
  INDEX idx_sched_lookup (day, room_id, start_time),
  INDEX idx_sched_status (status)
) ENGINE=InnoDB;

-- Personal events: saved from scanned/photographed timetables or added by hand
CREATE TABLE IF NOT EXISTS personal_events (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NOT NULL,
  title      VARCHAR(150) NOT NULL,
  day        ENUM('Mon','Tue','Wed','Thu','Fri','Sat') NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL,
  location   VARCHAR(120) NULL,
  source     ENUM('manual','scan') NOT NULL DEFAULT 'manual',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS chat_logs (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  user_id    INT NULL,
  message    TEXT NOT NULL,
  reply      TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;
