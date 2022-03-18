'use strict';
const express = require('express');
const router = express.Router();
const Schedule = require('../models/schedule');

const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(utc);
dayjs.extend(timezone);

/* GET home page. */
router.get('/', (req, res, next) => {
  const title = '予定調整くん';
  if (req.user) {
    Schedule.findAll({
      where: {
        createdBy: req.user.id
      },
      order: [['updatedAt', 'DESC']]
    }).then(schedules => {
      schedules.forEach(schedule => {
        // dayjsをつかってちょっと遊んでみました。
        // 練習問題をさらに「2022年 2月 22日 金 PM 2時22分」のように変えてみました。
        // 漢字を使った日時表記に変更。さらに、午前・午後、曜日を足してみる。
        // また、そのまま日本語表記にすると数字が1ケタの時、01時、02時のようになると違和感がある部分があるので、その部分の表記も1ケタのときは先頭に0がつかないようにしてみる。

        const days = ['日', '月', '火', '水', '木', '金', '土'];
        const dayIsToday = days[dayjs(schedule.updatedAt).tz('Asia/Tokyo').format('d')]; // format('d')で0-6の数字(日曜日が0)が返ってくるので、曜日の配列を作って漢字の曜日に出来るようにする。
        schedule.formattedUpdatedAt = dayjs(schedule.updatedAt).tz('Asia/Tokyo').format(`YYYY年 M月 D日 ${dayIsToday} A h時mm分`); // M月 D日のMは1-12、Dは1-31、Aは午前午後、h時は1-12の12時間表記の時刻。
      });
      res.render('index', {
        title: title,
        user: req.user,
        schedules: schedules
      });
    });
  } else {
    res.render('index', { title: title, user: req.user });
  }
});

module.exports = router;
