-- =====================================================
-- SCHEDULIQ DATABASE VERIFICATION
-- =====================================================
-- 1. Check database tables
SHOW TABLES FROM scheduliq;

-- 2. Check registered users
SELECT
    id,
    name AS full_name,
    email,
    role,
    department,
    created_at
FROM scheduliq.users
ORDER BY id DESC;

-- 3. Check classrooms
SELECT *
FROM scheduliq.classrooms
ORDER BY room_code;

-- 4. Check subjects
SELECT *
FROM scheduliq.subjects
ORDER BY subject_code;

-- 5. Check teaching assignments
SELECT *
FROM scheduliq.teaching_assignments;

-- 6. Check faculty availability
SELECT *
FROM scheduliq.faculty_availability;

-- 7. Check schedules
SELECT *
FROM scheduliq.schedules
ORDER BY day, start_time;

-- 8. Check schedule approval status
SELECT
    status,
    COUNT(*) AS total
FROM scheduliq.schedules
GROUP BY status;

-- 9. Check database structure
DESCRIBE scheduliq.users;
DESCRIBE scheduliq.classrooms;
DESCRIBE scheduliq.subjects;
DESCRIBE scheduliq.teaching_assignments;
DESCRIBE scheduliq.faculty_availability;
DESCRIBE scheduliq.schedules;
