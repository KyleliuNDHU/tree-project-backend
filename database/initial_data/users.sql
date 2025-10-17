-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- 主機： 127.0.0.1
-- 產生時間： 2025-05-18 13:07:56
-- 伺服器版本： 10.4.32-MariaDB
-- PHP 版本： 8.1.25

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- 資料庫： `tree_data`
--

-- --------------------------------------------------------

--
-- 資料表結構 `users`
--

CREATE TABLE `users` (
  `user_id` int(11) NOT NULL COMMENT '使用者唯一識別碼 (主鍵)',
  `username` varchar(50) NOT NULL COMMENT '登入帳號 (必須唯一)',
  `password_hash` varchar(255) NOT NULL COMMENT '加密後的密碼雜湊值',
  `display_name` varchar(100) DEFAULT NULL COMMENT '顯示名稱 (可選)',
  `role` enum('系統管理員','業務管理員','專案管理員','調查管理員','一般使用者') NOT NULL DEFAULT '一般使用者' COMMENT '使用者角色權限',
  `associated_projects` text DEFAULT NULL COMMENT '關聯專案清單，以逗號分隔的專案代碼',
  `is_active` tinyint(1) NOT NULL DEFAULT 1 COMMENT '帳號是否啟用 (1=啟用, 0=禁用)',
  `login_attempts` int(11) DEFAULT 0 COMMENT '登入嘗試次數',
  `last_attempt_time` datetime DEFAULT NULL COMMENT '最後登入嘗試時間',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp() COMMENT '帳號建立時間',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp() COMMENT '帳號最後更新時間'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='儲存應用程式使用者帳號資訊';

--
-- 傾印資料表的資料 `users`
--

INSERT INTO `users` (`user_id`, `username`, `password_hash`, `display_name`, `role`, `associated_projects`, `is_active`, `login_attempts`, `last_attempt_time`, `created_at`, `updated_at`) VALUES
(1, 'admin', '$2b$10$F1aGiPLUChLipFEHOzxMpO8kFXjyGszCfRfJdOBOWOIsqX9HEyYna', '維護測試', '系統管理員', '3,4,5,6,7,8,9,10,11,12,14,15,16,17,18,19,20,21,22,23,24,25,26,27,36,48,51,52,53,54,55,57,60,61', 1, 0, NULL, '2025-04-29 00:06:21', '2025-05-16 23:50:48'),
(4, 'Taichung', '$2b$10$mCjx/dDQHRMYA/WdlCMM7eJzo5aXf6FoQtnufVzK6rLb7.tTmLdHW', '林柔安', '業務管理員', '61', 1, 0, NULL, '2025-05-01 19:48:31', '2025-05-17 11:22:09'),
(5, 'Kyleliu', '$2b$10$fCT7E2dUfWGsbFQXTkq5t.nYy0WxX2R5mio3BomTZPgeV1ulVzPrW', '劉旻豪', '一般使用者', '52', 1, 0, NULL, '2025-05-16 20:03:59', '2025-05-16 23:51:03'),
(6, 'test', '$2b$10$GIiFeRlzTayWlVOhg5tmo.HT3b8s4I0xfGVPkoAR4Lj7ECWpz4oFu', '測試', '調查管理員', '48', 1, 0, NULL, '2025-05-16 20:33:18', '2025-05-16 23:51:13'),
(7, 'tt2', '$2b$10$7gQw9b1o8n2T8wbbGXcMh.09GXqOMtyGGBP23yIJYVAKqDAog8Mlm', 'tt2', '專案管理員', NULL, 1, 0, NULL, '2025-05-17 11:22:43', '2025-05-17 11:22:43');

--
-- 已傾印資料表的索引
--

--
-- 資料表索引 `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`user_id`),
  ADD UNIQUE KEY `username` (`username`);

--
-- 在傾印的資料表使用自動遞增(AUTO_INCREMENT)
--

--
-- 使用資料表自動遞增(AUTO_INCREMENT) `users`
--
ALTER TABLE `users`
  MODIFY `user_id` int(11) NOT NULL AUTO_INCREMENT COMMENT '使用者唯一識別碼 (主鍵)', AUTO_INCREMENT=8;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
