'use strict';
const express = require('express');
const router = express.Router();
const Schedule = require('../models/schedule');

/* GET home page. */
router.get('/', (req, res, next) => {
  const title = '予定調整くん';
  if (req.user) {
    Schedule.findAll({
      where: {
        createdBy: req.user.id
      },
      order: [['updatedAt', 'DESC']]
    }).then((schedules) => {
	    schedules.forEach((schedule) => {
		    const dateOptions = {
			    dateStyle: 'full',       // 日付の表示スタイル full long medium short
			    timeStyle: 'short',      // 時刻の表示スタイル full long medium short
			    era:'long'               // 年代の表現         long short narrow
		    }
		    schedule.formattedUpdatedAt = new Intl.DateTimeFormat('ja-JP-u-ca-japanese', dateOptions).format(schedule.updatedAt);
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
