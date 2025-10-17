-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- 主機： 127.0.0.1
-- 產生時間： 2025-05-19 00:52:33
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
-- 檢視表結構 `tree_survey_with_areas`
--

CREATE ALGORITHM=UNDEFINED DEFINER=`root`@`localhost` SQL SECURITY DEFINER VIEW `tree_survey_with_areas`  AS SELECT `ts`.`id` AS `id`, `ts`.`專案區位` AS `專案區位`, `ts`.`專案代碼` AS `專案代碼`, `ts`.`專案名稱` AS `專案名稱`, `ts`.`系統樹木` AS `系統樹木`, `ts`.`專案樹木` AS `專案樹木`, `ts`.`樹種編號` AS `樹種編號`, `ts`.`樹種名稱` AS `樹種名稱`, `ts`.`X坐標` AS `X坐標`, `ts`.`Y坐標` AS `Y坐標`, `ts`.`狀況` AS `狀況`, `ts`.`註記` AS `註記`, `ts`.`樹木備註` AS `樹木備註`, `ts`.`樹高（公尺）` AS `樹高（公尺）`, `ts`.`胸徑（公分）` AS `胸徑（公分）`, `ts`.`調查備註` AS `調查備註`, `ts`.`調查時間` AS `調查時間`, `ts`.`碳儲存量` AS `碳儲存量`, `ts`.`推估年碳吸存量` AS `推估年碳吸存量`, `pa`.`id` AS `area_id`, `pa`.`area_code` AS `area_code`, `pa`.`description` AS `area_description` FROM (`tree_survey` `ts` left join `project_areas` `pa` on(`ts`.`專案區位` = `pa`.`area_name`)) ;

--
-- VIEW `tree_survey_with_areas`
-- 資料： 無
--

COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
