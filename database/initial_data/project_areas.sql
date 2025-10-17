-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- 主機： 127.0.0.1
-- 產生時間： 2025-05-18 13:07:03
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
-- 資料表結構 `project_areas`
--

CREATE TABLE `project_areas` (
  `id` int(11) NOT NULL,
  `area_name` varchar(50) NOT NULL COMMENT '區位名稱',
  `area_code` varchar(10) NOT NULL COMMENT '區位代碼',
  `description` text DEFAULT NULL COMMENT '區位描述',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `city` varchar(20) DEFAULT NULL COMMENT '所屬縣市',
  `center_lat` double DEFAULT NULL COMMENT '中心點緯度',
  `center_lng` double DEFAULT NULL COMMENT '中心點經度'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='專案區位資料表';

--
-- 傾印資料表的資料 `project_areas`
--

INSERT INTO `project_areas` (`id`, `area_name`, `area_code`, `description`, `created_at`, `updated_at`, `city`, `center_lat`, `center_lng`) VALUES
(1, '基隆港', 'AREA-001', '基隆港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:53:26', '基隆市', NULL, NULL),
(2, '安平港', 'AREA-002', '安平港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:53:45', '台南市', NULL, NULL),
(3, '布袋港', 'AREA-003', '布袋港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:54:51', '嘉義縣', NULL, NULL),
(4, '澎湖港', 'AREA-004', '澎湖港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:55:02', '澎湖縣', NULL, NULL),
(5, '臺中港', 'AREA-005', '臺中港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:55:13', '台中市', NULL, NULL),
(6, '臺北港', 'AREA-006', '臺北港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:57:43', '新北市', NULL, NULL),
(7, '花蓮港', 'AREA-007', '花蓮港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:57:56', '花蓮縣', NULL, NULL),
(8, '蘇澳港', 'AREA-008', '蘇澳港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:58:06', '宜蘭縣', NULL, NULL),
(9, '高雄港', 'AREA-009', '高雄港專案區位', '2025-05-11 15:19:15', '2025-05-11 16:58:24', '高雄市', NULL, NULL);

--
-- 已傾印資料表的索引
--

--
-- 資料表索引 `project_areas`
--
ALTER TABLE `project_areas`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `area_name` (`area_name`),
  ADD UNIQUE KEY `area_code` (`area_code`);

--
-- 在傾印的資料表使用自動遞增(AUTO_INCREMENT)
--

--
-- 使用資料表自動遞增(AUTO_INCREMENT) `project_areas`
--
ALTER TABLE `project_areas`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=59;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
