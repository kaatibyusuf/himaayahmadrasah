-- database.sql
CREATE DATABASE IF NOT EXISTS himaayah;
USE himaayah;

-- Users (admins, teachers, students as accounts)
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','teacher','student') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Students (profile details)
CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  student_number VARCHAR(50) UNIQUE,
  class ENUM('awwal','thaaniy','thaalith_ibtidaaiyyah','awwal_idaadiyyah') DEFAULT 'awwal',
  phone VARCHAR(50),
  address TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Classes table (meta)
CREATE TABLE classes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE,
  name VARCHAR(100),
  description TEXT
);

-- Subjects
CREATE TABLE subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE,
  name_en VARCHAR(200),
  name_ar VARCHAR(200)
);

-- Exams (an exam instance)
CREATE TABLE exams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200),
  subject_id INT,
  class_id INT,
  duration_minutes INT DEFAULT 60,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (subject_id) REFERENCES subjects(id),
  FOREIGN KEY (class_id) REFERENCES classes(id)
);

-- Questions (stored client-side for now but also in DB)
CREATE TABLE questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  exam_id INT,
  question_text TEXT,
  question_text_ar TEXT,
  q_type ENUM('mcq','essay') DEFAULT 'essay',
  options JSON NULL,
  answer TEXT NULL,
  marks INT DEFAULT 1,
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE
);

-- Results (each student's attempt per exam)
CREATE TABLE results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  exam_id INT,
  answers JSON,
  total_marks DECIMAL(6,2) DEFAULT 0,
  percentage DECIMAL(5,2) DEFAULT 0,
  grade CHAR(1) NULL,
  graded_by INT NULL,
  graded_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (exam_id) REFERENCES exams(id)
);

-- Semester results for GPA
CREATE TABLE semester_results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  semester ENUM('1','2'),
  gpa DECIMAL(3,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Payments
CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NULL,
  user_email VARCHAR(200),
  purpose VARCHAR(100),
  method VARCHAR(50),
  amount DECIMAL(10,2) DEFAULT 0,
  reference VARCHAR(200),
  status ENUM('PENDING','SUCCESS','FAILED') DEFAULT 'PENDING',
  meta JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Journals
CREATE TABLE journals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  title VARCHAR(255),
  content TEXT,
  tags VARCHAR(255),
  is_shareable TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Pods (accountability)
CREATE TABLE pods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200),
  description TEXT,
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pod_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pod_id INT,
  student_id INT,
  role ENUM('member','lead') DEFAULT 'member',
  FOREIGN KEY (pod_id) REFERENCES pods(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE pod_posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pod_id INT,
  student_id INT,
  message TEXT,
  reactions JSON,
  flagged TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (pod_id) REFERENCES pods(id),
  FOREIGN KEY (student_id) REFERENCES students(id)
);

-- Blog posts
CREATE TABLE posts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(300),
  slug VARCHAR(300) UNIQUE,
  excerpt TEXT,
  content TEXT,
  author_id INT,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simple seed data
INSERT INTO users (name,email,password,role) VALUES
('Admin','admin@himaayah.local','$2b$10$7sTQpK0u1mWmFakeHashHere', 'admin'); -- replace with real hash

INSERT INTO classes (code,name,description) VALUES
('awwal','Awwal','First level primary'),
('thaaniy','Thaaniy','Second level primary'),
('thaalith','Thaalith Ibtidaaiyyah','Third level primary'),
('awwal_idaadi','Awwal Idaadiyyah','First secondary');

INSERT INTO subjects (code,name_en,name_ar) VALUES
('sarf','Sarf','الصرف'),
('nahw','Nahw','النحو'),
('hadeeth','Hadeeth','الحديث'),
('tawheed','Tawheed','التوحيد'),
('balaagah','Balaagah','البلاغة'),
('arabiyyah','Arabiyyah','العربية'),
('tajweed','Tajweed','التجويد'),
('fiqh','Fiqh','الفقه'),
('mahfuuzah','Mahfuuzah','المحفوظة'),
('seerah','Seerah','السيرة');

-- Note: For security, replace sample hashed password with properly hashed one during setup.
