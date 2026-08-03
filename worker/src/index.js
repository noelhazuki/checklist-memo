export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
      });
    }

    try {
      if (path === "/boards" && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM boards ORDER BY created_at ASC"
        ).all();
        return json(results);
      }

      if (path === "/boards" && method === "POST") {
        const { name } = await request.json();
        const id = crypto.randomUUID();
        const now = Date.now();
        await env.DB.prepare(
          "INSERT INTO boards (id, name, created_at) VALUES (?, ?, ?)"
        ).bind(id, name, now).run();
        return json({ id, name, created_at: now });
      }

      const boardIdMatch = path.match(/^\/boards\/([^\/]+)$/);
      if (boardIdMatch && method === "PUT") {
        const { name } = await request.json();
        await env.DB.prepare(
          "UPDATE boards SET name = ? WHERE id = ?"
        ).bind(name, boardIdMatch[1]).run();
        return json({ ok: true });
      }

      if (boardIdMatch && method === "DELETE") {
        const id = boardIdMatch[1];
        await env.DB.prepare("DELETE FROM memos WHERE board_id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM boards WHERE id = ?").bind(id).run();
        return json({ ok: true });
      }

      const memosListMatch = path.match(/^\/boards\/([^\/]+)\/memos$/);
      if (memosListMatch && method === "GET") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM memos WHERE board_id = ? ORDER BY sort_order ASC, created_at ASC"
        ).bind(memosListMatch[1]).all();
        return json(results);
      }

      if (memosListMatch && method === "POST") {
        const boardId = memosListMatch[1];
        const items = await request.json();
        const now = Date.now();

        const { results: maxRows } = await env.DB.prepare(
          "SELECT COALESCE(MAX(sort_order), -1) as maxOrder FROM memos WHERE board_id = ?"
        ).bind(boardId).all();
        let order = (maxRows[0]?.maxOrder ?? -1) + 1;

        const inserted = [];
        for (const item of items) {
          const id = crypto.randomUUID();
          await env.DB.prepare(
            "INSERT INTO memos (id, board_id, heading, body, done, item_done, sort_order, created_at) VALUES (?, ?, ?, ?, 0, '[]', ?, ?)"
          ).bind(id, boardId, item.heading, item.body || "", order, now).run();
          inserted.push({ id, board_id: boardId, heading: item.heading, body: item.body || "", done: 0, item_done: "[]", sort_order: order, created_at: now });
          order++;
        }
        return json(inserted);
      }

      const memoIdMatch = path.match(/^\/memos\/([^\/]+)$/);
      if (memoIdMatch && method === "PATCH") {
        const body = await request.json();
        const fields = [];
        const values = [];

        if (body.done !== undefined) {
          fields.push("done = ?");
          values.push(body.done ? 1 : 0);
        }
        if (body.heading !== undefined) {
          fields.push("heading = ?");
          values.push(body.heading);
        }
        if (body.body !== undefined) {
          fields.push("body = ?");
          values.push(body.body);
        }
        if (body.item_done !== undefined) {
          fields.push("item_done = ?");
          values.push(JSON.stringify(body.item_done));
        }

        if (fields.length === 0) {
          return json({ error: "更新する項目がありません" }, 400);
        }

        values.push(memoIdMatch[1]);
        await env.DB.prepare(
          `UPDATE memos SET ${fields.join(", ")} WHERE id = ?`
        ).bind(...values).run();
        return json({ ok: true });
      }

      if (memoIdMatch && method === "DELETE") {
        await env.DB.prepare("DELETE FROM memos WHERE id = ?").bind(memoIdMatch[1]).run();
        return json({ ok: true });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
